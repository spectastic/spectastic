import { describe, expect, it } from 'vitest';
import { contractNameUniqueRule } from '../src/rules/contract-name-unique.js';
import { parse } from '../src/parser.js';
import type { Finding, ParsedDocument } from '../src/types.js';

/**
 * `contract-name-unique` (076 FR-007, change 2026-08-02-contract-key-stability).
 *
 * The defect this closes is not that the key is hard-wired to a filename — an
 * explicit `name=` has always won. It is that nothing prompted for the
 * attribute, so every key was a basename in practice, and the directory is
 * discarded before the key is formed. Two versioned contracts then collide.
 */

// Build the document with the real parser rather than hand-assembling one.
//
// The previous version wrote `ast: parse(html)` — but `parse` returns a whole
// ParsedDocument, not an AST, so `doc.ast` was a nested ParsedDocument and the
// fixture was malformed. It passed anyway because the rule ignored `doc.ast`
// and re-parsed `doc.html`; the moment the rule started trusting the document
// it was handed, this went red. tsconfig excludes `test/`, so nothing typechecks
// these files and the wrong shape compiled silently — which is also why the
// comment that used to sit here, claiming a wrong field would fail to compile,
// was not true.
function check(html: string): Finding[] {
  const doc: ParsedDocument = parse(html, 'specs/001-x/design.html');
  return contractNameUniqueRule.check({ doc });
}

const wrap = (body: string): string => `<!doctype html><html><body>${body}</body></html>`;

describe('a basename collision across directories is an error', () => {
  it('flags two versioned contracts whose paths differ only by directory', () => {
    // The ordinary case, not a corner: v1 and v2 of one API.
    const findings = check(
      wrap(`
        <spec-contract shape="request-response" path="api/v1/openapi.yaml" format="OpenAPI"></spec-contract>
        <spec-contract shape="request-response" path="api/v2/openapi.yaml" format="OpenAPI"></spec-contract>
      `),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.message).toContain('openapi');
    expect(findings[0]?.rule).toBe('contract-name-unique');
  });

  it('an explicit name= on one of them resolves the collision', () => {
    // The escape hatch working as designed, once something asks for it.
    const findings = check(
      wrap(`
        <spec-contract shape="request-response" name="orders-v1" path="api/v1/openapi.yaml" format="OpenAPI"></spec-contract>
        <spec-contract shape="request-response" path="api/v2/openapi.yaml" format="OpenAPI"></spec-contract>
      `),
    );
    expect(findings).toEqual([]);
  });

  it('points at the second declaration and names where the first was', () => {
    const findings = check(
      wrap(`
        <spec-contract shape="rpc" path="proto/orders.proto" format="proto"></spec-contract>
        <spec-contract shape="rpc" path="other/orders.proto" format="proto"></spec-contract>
      `),
    );
    expect(findings[0]?.message).toMatch(/line \d+/);
  });
});

describe('the cases that must stay silent', () => {
  it('a single contract cannot collide', () => {
    expect(check(wrap('<spec-contract shape="request-response" path="api/openapi.yaml"></spec-contract>'))).toEqual([]);
  });

  it('a design with no contracts at all costs nothing and reports nothing', () => {
    expect(check(wrap('<p>no contracts here</p>'))).toEqual([]);
  });

  it('two shape="none" declarations do not collide — there is no key to share', () => {
    const findings = check(
      wrap('<spec-contract shape="none"></spec-contract><spec-contract shape="none"></spec-contract>'),
    );
    expect(findings).toEqual([]);
  });

  it('distinct basenames are fine even in the same directory', () => {
    const findings = check(
      wrap(`
        <spec-contract shape="request-response" path="api/orders.yaml" format="OpenAPI"></spec-contract>
        <spec-contract shape="event-driven" path="api/events.yaml" format="AsyncAPI"></spec-contract>
      `),
    );
    expect(findings).toEqual([]);
  });
});
