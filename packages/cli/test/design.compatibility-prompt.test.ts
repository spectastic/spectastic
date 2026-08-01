import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Content tests for spec 077-event-schema-evolution: the compatibility-stance
 * interview questions added to commands/spectastic.design.md (US1/US3), and the
 * claim-not-verification copy discipline (US3, FR-005/SC-003). Mirrors
 * design.contract-section.test.ts's precedent — the interview half is
 * harness-native (AskUserQuestion) with no CLI-testable surface, so it is
 * asserted structurally against the authored source text.
 *
 * Written before the content exists (T-100/T-101/T-102/T-300/T-301) — failing
 * until T-110/T-111/T-310/T-311 land.
 */

const here = dirname(fileURLToPath(import.meta.url));
// commands/spectastic.design.md is the source of truth (CLAUDE.md: .claude/commands/
// is a gitignored one-time copy that does not auto-sync) — read the source, not
// the copy, so this test can't pass against a stale mirror.
const COMMAND_MD = resolve(here, '..', '..', '..', 'commands', 'spectastic.design.md');
const TEMPLATE = resolve(here, '..', '..', '..', 'templates', 'design.html');

function commandMd(): string {
  return readFileSync(COMMAND_MD, 'utf8');
}

function template(): string {
  return readFileSync(TEMPLATE, 'utf8');
}

describe('commands/spectastic.design.md — compatibility direction question (US1, FR-001/FR-005/NFR-002)', () => {
  it('asks for a compatibility direction naming all four registry terms', () => {
    const md = commandMd();
    expect(md).toMatch(/compatibility/i);
    expect(md).toMatch(/\bbackward\b/i);
    expect(md).toMatch(/\bforward\b/i);
    expect(md).toMatch(/\bfull\b/i);
    expect(md).toMatch(/\bnone\b/i);
  });

  it('states each option carries its meaning inline, never the bare term alone', () => {
    const md = commandMd();
    expect(md).toMatch(/meaning inline/i);
  });

  it('is gated on a change to an event-driven declared contract, prompting for nothing otherwise (FR-004)', () => {
    const md = commandMd();
    expect(md).toMatch(/event-driven/i);
    expect(md).toMatch(/changing/i);
  });

  it('respects the existing decision-phase limits (NFR-002)', () => {
    const md = commandMd();
    expect(md).toMatch(/≤4|at most 4/i);
    expect(md).toMatch(/2–4 options|2-4 options/i);
  });
});

describe('commands/spectastic.design.md — compatibility scope question (US3, FR-003)', () => {
  it('asks separately about already-published messages, distinguishing it from future-message compatibility', () => {
    const md = commandMd();
    expect(md).toMatch(/already-published/i);
    expect(md).toMatch(/future/i);
  });

  it('frames the scope as the replay question, not a registry suffix', () => {
    const md = commandMd();
    expect(md).toMatch(/replay/i);
  });
});

describe('claim-not-verification copy (US3, FR-005/SC-003)', () => {
  it('the rendered-label copy states the stance is a claim, never a verified property', () => {
    const css = readFileSync(resolve(here, '..', '..', '..', 'assets', 'spec.css'), 'utf8');
    expect(css).toMatch(/claims/i);
  });

  it('the design template repeats the claim-not-verification framing in its guidance', () => {
    const html = template();
    // Specific to the compatibility-stance framing, not the pre-existing "Claim the
    // design rests on" grounding-table header (a false-positive a looser /claim/i
    // match would accept).
    expect(html).toMatch(/compatibility.{0,80}claim|claim.{0,80}compatibility/is);
    expect(html).not.toMatch(/verified compatib/i);
  });
});
