import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Content tests for spec 069-design-contract-section: the new §3 "Data model
 * & contracts" section in templates/design.html (US1/US2), and the
 * interface-shape interview instructions added to commands/spectastic.design.md
 * (US3). Mirrors design.stack-interview.test.ts's precedent — the interview
 * half is harness-native (AskUserQuestion) with no CLI-testable surface, so
 * both are asserted structurally against the authored source text.
 *
 * Written before the content exists (T-100/T-101/T-200/T-300/T-301/T-302) —
 * failing until T-110/T-111/T-210/T-310..T-313 land.
 */

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(here, '..', '..', '..', 'templates', 'design.html');
// commands/spectastic.design.md is the source of truth (CLAUDE.md: .claude/commands/
// is a gitignored one-time copy that does not auto-sync) — read the source, not
// the copy, so this test can't pass against a stale mirror.
const COMMAND_MD = resolve(here, '..', '..', '..', 'commands', 'spectastic.design.md');

function template(): string {
  return readFileSync(TEMPLATE, 'utf8');
}

function commandMd(): string {
  return readFileSync(COMMAND_MD, 'utf8');
}

describe('templates/design.html — §3 Data model & contracts (US1, FR-001/FR-002/FR-003)', () => {
  it('carries a §3 heading titled "Data model & contracts"', () => {
    expect(template()).toMatch(/<h2>3 · Data model &amp; contracts<\/h2>/);
  });

  it('the new §3 sits immediately after Technical context (§2)', () => {
    const html = template();
    const techContextIdx = html.indexOf('id="technical-context"');
    const contractsIdx = html.indexOf('id="contracts"');
    const groundingIdx = html.indexOf('id="grounding"');
    expect(techContextIdx).toBeGreaterThan(-1);
    expect(contractsIdx).toBeGreaterThan(-1);
    expect(groundingIdx).toBeGreaterThan(-1);
    expect(techContextIdx).toBeLessThan(contractsIdx);
    expect(contractsIdx).toBeLessThan(groundingIdx);
  });

  it('carries a placeholder physical-model table and one placeholder <spec-contract>', () => {
    const html = template();
    expect(html).toMatch(/<spec-contract[^>]*shape="\[SHAPE\]"/);
    // A table between the section heading and the placeholder element.
    const section = html.slice(html.indexOf('id="contracts"'), html.indexOf('id="grounding"'));
    expect(section).toMatch(/<table>/);
  });

  it('renumbers §4 through §12 in document order, with no gap or repeat (T-101)', () => {
    const html = template();
    const headings = [...html.matchAll(/<h2>(\d+) ·/g)].map((m) => Number(m[1]));
    expect(headings).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});

describe('templates/design.html — §3 linking guidance (US2, FR-006)', () => {
  it("points authors at the spec's own conceptual entities rather than a restated field list", () => {
    const html = template();
    const section = html.slice(html.indexOf('id="contracts"'), html.indexOf('id="grounding"'));
    expect(section).toMatch(/href="\.\/spec\.html#/);
    expect(section).toMatch(/conceptual entit/i);
  });

  it('asks for boundaries/error-shape/consumer-reliance reasoning, not a schema copy', () => {
    const html = template();
    const section = html.slice(html.indexOf('id="contracts"'), html.indexOf('id="grounding"'));
    expect(section).toMatch(/boundar/i);
    expect(section).toMatch(/error/i);
    expect(section).toMatch(/not a (field-by-field )?copy of the schema/i);
  });
});

describe('commands/spectastic.design.md — interface-shape interview (US3, FR-004/FR-005/FR-007/NFR-001)', () => {
  it('asks the interface shape, naming all five tokens, before any format question (FR-004)', () => {
    const md = commandMd();
    expect(md).toMatch(/interface.shape/i);
    expect(md).toMatch(/request\/response/i);
    expect(md).toMatch(/\bRPC\b/);
    expect(md).toMatch(/GraphQL/);
    expect(md).toMatch(/event-driven/i);
    expect(md).toMatch(/\bnone\b/);
    expect(md).toMatch(/before any format question/i);
  });

  it('seeds the offered format from the shape, states no fixed default, and no unearned crown (FR-005)', () => {
    const md = commandMd();
    expect(md).toMatch(/OpenAPI/);
    expect(md).toMatch(/proto/i);
    expect(md).toMatch(/SDL/i);
    expect(md).toMatch(/AsyncAPI/);
    expect(md).toMatch(/never a fixed default/i);
    expect(md).toMatch(/no crown/i);
  });

  it('offers the event-direction sub-question only for the event-driven shape (US3)', () => {
    const md = commandMd();
    expect(md).toMatch(/publishes/i);
    expect(md).toMatch(/consumes/i);
    expect(md).toMatch(/\bboth\b/i);
  });

  it('states the both-surfaces case seeds both formats, per the multi-contract allowance (FR-007)', () => {
    const md = commandMd();
    expect(md).toMatch(/both surfaces.{0,20}both formats|seeds both formats/i);
  });

  it('respects the decision-phase question/option limits and skips answered dimensions (NFR-001)', () => {
    const md = commandMd();
    expect(md).toMatch(/≤4|at most 4/i);
    expect(md).toMatch(/2–4 options|2-4 options/i);
    expect(md).toMatch(/skip(ped)? when/i);
  });
});

/**
 * The contract sidecar convention (spec 070-contract-sidecar-convention, FR-001/
 * FR-005). Both the template's §3 comment and the design command must name
 * `contracts/` as the proposed location and never use `references/`, which the
 * knowledge corpus already owns (a distinct vocabulary collision, not a naming
 * preference — see design.html D-005). Written before the content exists
 * (T-300) — failing until T-310/T-311 land.
 */
describe('the contract sidecar convention — proposed vs. effective location (070, FR-001/FR-005)', () => {
  it('the template names contracts/ as the proposed location', () => {
    const html = template();
    expect(html).toMatch(/contracts\//i);
  });

  it('the template distinguishes proposed from effective', () => {
    const html = template();
    expect(html).toMatch(/proposed/i);
    expect(html).toMatch(/effective/i);
  });

  it('the design command documents the same two locations', () => {
    const md = commandMd();
    expect(md).toMatch(/contracts\//i);
    expect(md).toMatch(/proposed/i);
    expect(md).toMatch(/effective/i);
  });

  it('neither the template nor the command markdown uses references/ for this convention', () => {
    // references/ already denotes a corpus pack's citable documents (D-005) —
    // reusing it here would collide in vocabulary while sharing no semantics.
    const html = template();
    const md = commandMd();
    expect(html).not.toMatch(/references\/(?!.*corpus)/i);
    expect(md).not.toMatch(/references\//i);
  });
});
