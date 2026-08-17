import { describe, expect, it } from 'vitest';
import { countConformance, mustDropFindings, requirementById } from '../src/change/must-drop.js';

/**
 * `conformance-dropped` (003 T-1005).
 *
 * The rule exists because three proposals in one session shipped a MODIFY
 * post-state that silently lost an obligation, each caught only by an
 * adversarial pass. The property under test is asymmetric on purpose: a
 * DECREASE is reported, an increase is not, and neither is a rewording that
 * keeps the same obligations.
 */

const spec = (body: string) => `<main><spec-requirement id="FR-001" priority="must">${body}</spec-requirement></main>`;
const delta = (body: string) => `<spec-delta op="modified" target="FR-001">${body}</spec-delta>`;
const run = (live: string, post: string) =>
  mustDropFindings({ proposalHtml: delta(post), proposalFile: 'p.html', specHtml: spec(live) });

const TWO = '<p>A <spec-rule>MUST</spec-rule> happen. B <spec-rule>MUST</spec-rule> also happen.</p>';

describe('countConformance', () => {
  it('counts each level separately', () => {
    const c = countConformance(
      '<spec-rule>MUST</spec-rule><spec-rule>MUST NOT</spec-rule><spec-rule level="should">SHOULD</spec-rule>',
    );
    expect(c.MUST).toBe(1);
    expect(c['MUST NOT']).toBe(1);
    expect(c.SHOULD).toBe(1);
  });

  // The ordering trap: "MUST NOT" contains "MUST", so a substring match would
  // double-count it and a MUST → MUST NOT change would look like no change.
  it('never counts a MUST NOT as a MUST', () => {
    const c = countConformance('<spec-rule>MUST NOT</spec-rule>');
    expect(c['MUST NOT']).toBe(1);
    expect(c.MUST).toBe(0);
  });
});

describe('mustDropFindings', () => {
  it('reports a post-state that loses a MUST', () => {
    const f = run(TWO, '<p>A <spec-rule>MUST</spec-rule> happen.</p>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('MUST 2 → 1');
    expect(f[0]?.rule).toBe('conformance-dropped');
  });

  // Warning, not error: removing an obligation is what a narrowing MODIFY IS.
  // The defect is the removal nobody noticed, which a warning surfaces without
  // pretending the tool can tell intent from accident.
  it('reports at warning severity, because a deliberate narrowing is legitimate', () => {
    expect(run(TWO, '<p>A <spec-rule>MUST</spec-rule> happen.</p>')[0]?.severity).toBe('warning');
  });

  it('is silent when every obligation is carried through', () => {
    expect(run(TWO, TWO)).toEqual([]);
  });

  it('is silent when the post-state ADDS an obligation', () => {
    expect(run(TWO, `${TWO}<p>C <spec-rule>MUST</spec-rule> too.</p>`)).toEqual([]);
  });

  it('is silent on a rewording that keeps the same obligations', () => {
    expect(run(TWO, '<p>Something else <spec-rule>MUST</spec-rule> X. And <spec-rule>MUST</spec-rule> Y.</p>')).toEqual(
      [],
    );
  });

  it('catches a MUST downgraded to a SHOULD, which reads as a rewording', () => {
    const f = run(TWO, '<p>A <spec-rule>MUST</spec-rule> happen. B <spec-rule level="should">SHOULD</spec-rule>.</p>');
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('MUST 2 → 1');
  });

  it('ignores ADD and REMOVE deltas — only a MODIFY retypes a post-state', () => {
    for (const op of ['added', 'removed', 'renamed']) {
      const html = `<spec-delta op="${op}" target="FR-001"><p>nothing</p></spec-delta>`;
      expect(mustDropFindings({ proposalHtml: html, proposalFile: 'p.html', specHtml: spec(TWO) })).toEqual([]);
    }
  });

  it('stays silent on a target the live spec does not carry — apply owns that refusal', () => {
    const html = '<spec-delta op="modified" target="FR-999"><p>x</p></spec-delta>';
    expect(mustDropFindings({ proposalHtml: html, proposalFile: 'p.html', specHtml: spec(TWO) })).toEqual([]);
  });

  // The recorded ceiling, asserted so it cannot be mistaken for a bug later.
  it('does NOT see a dropped sentence carrying no conformance keyword', () => {
    const live = `${TWO}<p>Accepted work belongs in the tracked list, not the inbox.</p>`;
    expect(run(live, TWO)).toEqual([]);
  });
});

describe('requirementById', () => {
  it('returns null for an id the spec does not carry', () => {
    expect(requirementById(spec(TWO), 'FR-404')).toBeNull();
  });
});
