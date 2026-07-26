/**
 * Shared corpus-citation grammar (spec 052-corpus-citation-contract, plan D-001).
 *
 * One small, pure piece consumed by both the `corpus-citation-form` shape
 * rule (schema, warns on a bare/malformed citation in a `<spec-decision>`)
 * and core's `resolveCitation` (resolves a citation to a corpus document).
 * Kept here — in @spectastic/schema, which is upstream of core — rather than
 * duplicated, so the rule and the resolver agree on what a citation is. The
 * slo-shared / `./slo` precedent, verbatim.
 *
 * The form is `KB-NNN@edition` (FR-002): a stable KB id (three or more
 * digits, matching 051's KB_ID_RE) pinned to the exact edition a claim was
 * grounded against. A bare `KB-NNN` (no `@edition`) parses to an edition of
 * `null` — a well-formed id that is not yet pinned, which the form rule
 * surfaces as a SHOULD-warn rather than dropping.
 */

/** A parsed corpus citation: a KB id and, when pinned, its edition. */
export interface CorpusCitation {
  id: string;
  /** The pinned edition, or null for a bare (unpinned) `KB-NNN`. */
  edition: string | null;
}

/** KB id: `KB-` then three or more digits (matches 051's KB_ID_RE). */
const KB_ID = 'KB-\\d{3,}';
/** A pinned citation `KB-NNN@edition`, or a bare `KB-NNN`. The edition is any
 * non-empty run of non-whitespace characters after the `@`. */
const CITATION_RE = new RegExp(`^(${KB_ID})(?:@(\\S+))?$`);
/** A KB reference token embedded in prose: the id plus any `@…` pin run, up
 * to whitespace or a tag boundary (052's former inline TOKEN_RE, moved here
 * per plan D-003 of 053 so the form rule and the resolve gates agree
 * byte-for-byte on what a citation token is). */
const EMBEDDED_TOKEN_RE = new RegExp(String.raw`${KB_ID}(?:@[^\s<]*)?`, 'g');
/** Trailing sentence punctuation to strip from a token found in prose.
 * Bounded ({1,10}, not unbounded +) — no realistic token ends in more than a
 * few punctuation marks, and a bounded quantifier gives the analyzer a
 * linear-time proof rather than relying on the class being simple (the same
 * bounded-quantifier mitigation OFFSCREEN_STYLE_RE uses in security/fence.ts). */
const TRAILING_PUNCTUATION_RE = /[.,;:)\]]{1,10}$/;

/**
 * Parse a single citation token. Returns `{ id, edition }` for a pinned
 * citation, `{ id, edition: null }` for a bare `KB-NNN`, and `null` for
 * anything that isn't a well-formed citation (a malformed id, an empty
 * edition after `@`, or a non-citation string). Never throws — a citation is
 * data read from an artifact (P-11), and a malformed one is a finding for the
 * form rule to render, never a crash.
 */
export function parseCorpusCitation(raw: string): CorpusCitation | null {
  const match = CITATION_RE.exec(raw.trim());
  if (!match) return null;
  const id = match[1];
  if (id === undefined) return null;
  return { id, edition: match[2] ?? null };
}

/**
 * Find every citation token embedded in a run of prose — a `<spec-decision>`'s
 * text, or any string that may reference a corpus source inline. Each token
 * has trailing sentence punctuation stripped, so the result is ready to hand
 * to `parseCorpusCitation`. Returns `[]` when no token is present. Never
 * throws (052-corpus-citation-contract's form rule and 053-corpus-grounding-
 * gates' resolve gates both call this — plan 053 D-003 — so the two agree on
 * what a citation token is).
 */
export function findCitationTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(EMBEDDED_TOKEN_RE)) {
    tokens.push(match[0].replace(TRAILING_PUNCTUATION_RE, ''));
  }
  return tokens;
}
