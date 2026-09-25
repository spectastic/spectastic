import { createHash } from 'node:crypto';

/**
 * Canonical JSON + content hash for the decision index (spec
 * 122-decision-index-federation, D-003). Two implementations must agree
 * byte-for-byte — this one, and the sibling MCP repository's mirror — so the
 * shape is deliberately minimal: sorted keys, `undefined` dropped, no
 * whitespace, otherwise `JSON.stringify` semantics. Pinned by a literal test
 * vector minted with a third (Python) implementation
 * (`test/fixtures/decision-index-vector.ts`), not by round-tripping through
 * this file's own output.
 */

/** Recursively sort object keys and drop `undefined` values; arrays keep
 *  their order. `JSON.stringify`'s replacer runs bottom-up (child values are
 *  already stringified by the time a parent object visits its keys), so
 *  sorting inside the replacer covers every nesting depth in one pass. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) sorted[key] = sortKeysDeep(v);
    }
    return sorted;
  }
  return value;
}

/** Deterministic JSON: object keys sorted, `undefined` values omitted, no
 *  whitespace. Arrays keep their order; every other value serialises as
 *  `JSON.stringify` would. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

/** `"sha256:" + hex digest` of the UTF-8 bytes of `canonicalJson(value)`. */
export function contentHashOf(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}
