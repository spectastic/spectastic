import { describe, expect, it } from 'vitest';
import { validate } from '../src/engine.js';

/**
 * 052-corpus-citation-contract T-100: red-first tests for the
 * corpus-citation-form rule (plan D-002). A per-file HTML warn rule — a
 * KB citation inside a <spec-decision> must be edition-pinned
 * (KB-NNN@edition, FR-002); a bare or malformed one warns. A KB-shaped
 * string outside a <spec-decision> is left alone (scope check, plan §8 R4).
 */
const RULE = 'corpus-citation-form';

function findings(html: string) {
  return validate(html, { file: 'plan.html' }).filter((f) => f.rule === RULE);
}

const decision = (inner: string) =>
  `<!doctype html><html><body><main>
   <spec-decision id="D-001" grounding="verified">
     <h4>D-001 · A domain decision</h4>
     <dl><dt>Context</dt><dd>${inner}</dd></dl>
   </spec-decision>
   </main></body></html>`;

describe('corpus-citation-form', () => {
  it('does not flag a well-formed edition-pinned citation', () => {
    expect(findings(decision('Grounded against <code>KB-001@2024-05-28</code>.'))).toEqual([]);
  });

  it('warns on a bare KB-NNN citation with no edition', () => {
    const f = findings(decision('Grounded against <code>KB-001</code>.'));
    expect(f.length).toBe(1);
    expect(f[0]?.severity).toBe('warning');
    expect(f[0]?.message).toContain('KB-001');
  });

  it('warns on a malformed citation (empty edition after @)', () => {
    const f = findings(decision('cites KB-002@ here'));
    expect(f.length).toBe(1);
    expect(f[0]?.severity).toBe('warning');
  });

  it('does not flag a KB-shaped string outside any <spec-decision>', () => {
    const html = `<!doctype html><html><body><main>
      <p>See KB-001 for background — this is prose, not a grounding citation.</p>
    </main></body></html>`;
    expect(findings(html)).toEqual([]);
  });

  it('flags each bare citation in a decision independently', () => {
    const f = findings(decision('cites <code>KB-001</code> and <code>KB-002</code>'));
    expect(f.length).toBe(2);
  });

  it('warns on a bare citation at the 4-digit KB-NNNN baseline too (2026-07-26-hybrid-corpus-citation T-1004)', () => {
    const f = findings(decision('Grounded against <code>KB-0001</code>.'));
    expect(f.length).toBe(1);
    expect(f[0]?.severity).toBe('warning');
    expect(f[0]?.message).toContain('KB-0001');
    expect(f[0]?.message).toContain('KB-NNNN@edition');
  });

  it('does not flag a well-formed edition-pinned 4-digit citation', () => {
    expect(findings(decision('Grounded against <code>KB-0001@2024-05-28</code>.'))).toEqual([]);
  });
});
