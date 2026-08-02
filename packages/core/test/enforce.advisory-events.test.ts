import { describe, expect, it } from 'vitest';
import { evaluateEnforcement } from '../src/enforce/policy.js';
import type { EnforcementCategory } from '../src/enforce/types.js';

/**
 * Advisory strength for an event-only-recognised interface (spec
 * 073-interface-detection-widening, US1 / FR-004; design D-003). Written before
 * the mechanism exists (T-101) — failing until T-111 lands.
 *
 * FR-004: a project whose interface is recognised ONLY through an event-driven
 * signal reports the contract-first gap at advisory strength and MUST NOT
 * hard-fail a profile floor on that branch alone. Reuses the existing `warned`
 * bucket (the non-blocking advisory tally FR-010 already routes into) rather
 * than inventing a severity system — but by a DISTINCT input, since FR-010's
 * demotion is keyed on the ecosystem being unable to express the category,
 * whereas here the category plainly applies and only the signal is weaker.
 */

const REQUIRED: readonly EnforcementCategory[] = ['contract-first'];
const NOTHING_COVERED = new Set<EnforcementCategory>();

describe('advisory categories demote a gap to a warning (073, FR-004)', () => {
  it('an event-only contract-first gap lands in warned, not missing, and does not gate', () => {
    const result = evaluateEnforcement(REQUIRED, NOTHING_COVERED, 'hard', new Set(['js']), {
      advisory: ['contract-first'],
    });

    expect(result.warned).toEqual(['contract-first']);
    expect(result.missing).toEqual([]);
    expect(result.exitCode).toBe(0); // MUST NOT hard-fail on that branch alone
  });

  it('without the advisory input the same gap still hard-fails — the HTTP branch is untouched', () => {
    const result = evaluateEnforcement(REQUIRED, NOTHING_COVERED, 'hard', new Set(['js']));

    expect(result.missing).toEqual(['contract-first']);
    expect(result.warned).toEqual([]);
    expect(result.exitCode).toBe(1);
  });

  it('a covered category is never reported at all, advisory or not', () => {
    const result = evaluateEnforcement(
      REQUIRED,
      new Set<EnforcementCategory>(['contract-first']),
      'hard',
      new Set(['js']),
      {
        advisory: ['contract-first'],
      },
    );

    expect(result.warned).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.covered).toEqual(['contract-first']);
    expect(result.exitCode).toBe(0);
  });

  it('advisory applies only to the named category — a sibling gap still blocks', () => {
    const result = evaluateEnforcement(['contract-first', 'linter'], NOTHING_COVERED, 'hard', new Set(['js']), {
      advisory: ['contract-first'],
    });

    expect(result.warned).toEqual(['contract-first']);
    expect(result.missing).toEqual(['linter']);
    expect(result.exitCode).toBe(1);
  });

  it('an advisory category resolves before a waiver is consulted — no waiver needed to not block', () => {
    // A project should not have to author a waiver for a gap the policy itself
    // has already decided is advisory.
    const result = evaluateEnforcement(REQUIRED, NOTHING_COVERED, 'hard', new Set(['js']), {
      advisory: ['contract-first'],
      waivers: [],
    });

    expect(result.warned).toEqual(['contract-first']);
    expect(result.relaxed).toEqual([]);
    expect(result.expired).toEqual([]);
  });

  it('is a no-op when the advisory list is empty or absent (pre-073 behaviour preserved)', () => {
    const withEmpty = evaluateEnforcement(REQUIRED, NOTHING_COVERED, 'hard', new Set(['js']), { advisory: [] });
    const withAbsent = evaluateEnforcement(REQUIRED, NOTHING_COVERED, 'hard', new Set(['js']));

    expect(withEmpty).toEqual(withAbsent);
    expect(withEmpty.exitCode).toBe(1);
  });
});
