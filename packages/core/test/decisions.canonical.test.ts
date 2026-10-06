import { describe, expect, it } from 'vitest';
import { canonicalJson, contentHashOf } from '../src/decisions/canonical.js';
import { DECISION_INDEX_VECTOR, DECISION_INDEX_VECTOR_HASH } from './fixtures/decision-index-vector.js';

/**
 * The canonical-JSON hash (spec 122-decision-index-federation, D-003, T-010).
 * The load-bearing assertion is the shared vector: two independent
 * implementations must agree byte-for-byte, so this test proves the digest
 * against a value this implementation did not produce.
 */
describe('canonicalJson', () => {
  it('sorts object keys', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('sorts keys recursively, inside nested objects and array elements', () => {
    expect(canonicalJson({ z: { d: 1, c: 2 }, a: [{ y: 1, x: 2 }] })).toBe('{"a":[{"x":2,"y":1}],"z":{"c":2,"d":1}}');
  });

  it('drops keys whose value is undefined', () => {
    expect(canonicalJson({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
  });

  it('preserves array order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });

  it('emits no whitespace', () => {
    expect(canonicalJson({ a: 1, b: 2 })).not.toMatch(/\s/);
  });

  it('produces the exact bytes the shared vector expects', () => {
    const expected =
      '[{"coordinate":"spectastic://acme/payments/decision/002-ledger/D-003","enforcement":{"rules":[{"id":"no_ledger_write","pattern":"UPDATE\\\\s+ledger","tool":"native-content"}]},"id":"D-003","modules":[],"paths":[],"posture":"block","reason":"Every ledger write must emit LedgerPosted — résumé of the audit rule.","resource":{"allowedIn":"src/**/persistence/**","coordinate":"spectastic://acme/payments/datastore/ledger","owner":"acme/payments"},"specId":"002-ledger","status":"accepted","title":"D-003 — only payments writes the ledger"},{"coordinate":"spectastic://acme/payments/decision/002-ledger/D-004","id":"D-004","modules":["acme.payments.api.."],"paths":["src/**/api/**"],"reason":"API handlers never touch storage.","specId":"002-ledger","status":"accepted"}]';
    expect(canonicalJson(DECISION_INDEX_VECTOR)).toBe(expected);
  });
});

describe('contentHashOf', () => {
  it("matches the shared vector's digest, minted with an independent implementation", () => {
    expect(contentHashOf(DECISION_INDEX_VECTOR)).toBe(DECISION_INDEX_VECTOR_HASH);
  });

  it('is deterministic — two hashes of the same value are byte-identical', () => {
    expect(contentHashOf(DECISION_INDEX_VECTOR)).toBe(contentHashOf(DECISION_INDEX_VECTOR));
  });

  it('changes when the input changes', () => {
    expect(contentHashOf([])).not.toBe(contentHashOf(DECISION_INDEX_VECTOR));
  });
});
