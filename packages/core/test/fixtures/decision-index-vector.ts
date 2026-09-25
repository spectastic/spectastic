/**
 * The shared canonical-JSON + hash vector (spec 122-decision-index-federation,
 * D-003). Minted with an independent (Python) implementation —
 * `json.dumps(decisions, sort_keys=True, separators=(',', ':'), ensure_ascii=False)`
 * — precisely so a TypeScript canonicaliser has something it did not write to
 * agree with. Mirrored verbatim in the sibling MCP repository
 * (`spectastic-mcp/packages/server/test/fixtures/`); a change here must land
 * there too.
 *
 * The vector deliberately includes: nested objects (`resource`, `enforcement`),
 * a Unicode value ("résumé"), and a backslash-escaped glob in a pattern
 * (`UPDATE\s+ledger`). Every object key is ASCII — Python sorts by code point
 * and JS sorts by UTF-16 code unit, and the two coincide only for ASCII; a
 * non-ASCII *key* would need a re-minted vector and an ordering note.
 */

/** The exact array `canonicalJson` must serialise — order preserved, values verbatim. */
export const DECISION_INDEX_VECTOR: readonly unknown[] = [
  {
    coordinate: 'spectastic://acme/payments/decision/002-ledger/D-003',
    id: 'D-003',
    specId: '002-ledger',
    status: 'accepted',
    posture: 'block',
    paths: [],
    modules: [],
    resource: {
      coordinate: 'spectastic://acme/payments/datastore/ledger',
      owner: 'acme/payments',
      allowedIn: 'src/**/persistence/**',
    },
    reason: 'Every ledger write must emit LedgerPosted — résumé of the audit rule.',
    title: 'D-003 — only payments writes the ledger',
    enforcement: { rules: [{ tool: 'native-content', id: 'no_ledger_write', pattern: 'UPDATE\\s+ledger' }] },
  },
  {
    coordinate: 'spectastic://acme/payments/decision/002-ledger/D-004',
    id: 'D-004',
    specId: '002-ledger',
    status: 'accepted',
    paths: ['src/**/api/**'],
    modules: ['acme.payments.api..'],
    reason: 'API handlers never touch storage.',
  },
];

/** `sha256:` + the expected hex digest over `canonicalJson(DECISION_INDEX_VECTOR)`. */
export const DECISION_INDEX_VECTOR_HASH =
  'sha256:9fc85308f19507eda27858a66e7c9d9054a07bcd466100d7b7377d8c12bc9226';
