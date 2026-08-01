/**
 * Shared project-identity grammar (spec 067-spec-project-identity, plan D-001/D-004).
 *
 * The corpus already has a DOI-shaped prefix (`corpus.marketplace`); specs have none —
 * every spectastic repo starts at `000` and reuses the same `042` / `REQ-*` / `T-*`
 * grammar, so across a multi-repo estate they collide with nothing to tell them apart.
 * This module is the pure, shared piece both `@spectastic/corpus` (the fs config reader,
 * `resolveProjectConfig`) and `@spectastic/core` (the `id` command engine) consume — kept
 * here, in @spectastic/schema, upstream of both, exactly like the citation grammar
 * (`./citation`) is shared by a corpus rule and a core gate. Never duplicated.
 *
 * Two primitives: `classifyProjectId` (the shape predicate US3's validate rule wraps) and
 * `specResourceUri` (the owner-as-authority URI composer, D-004, US2's `id` engine wraps).
 */

/**
 * The three shapes a `project` config value can take (FR-007, SC-005):
 *  - `owner-qualified` — at least one `/` (`<owner>/<repo>`, or a deeper subgroup path);
 *    genuinely distinguishing, the federation-safe shape. No validate finding.
 *  - `bare` — a single segment, no `/` (the no-remote provisional fallback, or a hand-set
 *    single word). Collision-prone but not broken — a validate WARNING (FR-007).
 *  - `malformed` — empty, whitespace, or an illegal/empty segment (leading, trailing, or
 *    doubled `/`; a character outside the safe set). A validate ERROR (FR-007).
 */
export type ProjectIdShape = 'owner-qualified' | 'bare' | 'malformed';

/** A single path segment's safe character set: alphanumeric, `.`, `_`, `-`; must start
 * and end with an alphanumeric (so a segment is never empty and never itself starts/ends
 * with a separator-like character). ASCII-only — deliberately conservative for a value
 * that becomes a URI authority/path component (D-004). */
const SEGMENT_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

/**
 * Classify a raw `project` config value's shape. Never throws — an untrusted or
 * hand-edited value degrades to `malformed` rather than crashing the caller (the same
 * loud-not-silent posture the corpus parsers already take).
 */
export function classifyProjectId(value: string): ProjectIdShape {
  if (value.trim() !== value || value.length === 0) return 'malformed';
  const segments = value.split('/');
  if (segments.some((segment) => !SEGMENT_RE.test(segment))) return 'malformed';
  return segments.length >= 2 ? 'owner-qualified' : 'bare';
}

/**
 * The resource kinds a coordinate can name. `spec` is 067's original; `contract`
 * is the sibling kind that design anticipated, added by spec
 * 076-contract-export-handover (D-001).
 */
export type ResourceKind = 'spec' | 'contract';

/**
 * Compose the canonical, federation-unique resource URI for a project resource
 * (067 FR-004/D-004; generalised by 076 D-001):
 * `spectastic://<owner>/<repo…>/<kind>/<name>#<anchor>`.
 *
 * Owner-as-authority — the project identity's first `/`-delimited segment is the
 * URI authority; everything after it (if any) becomes leading path segments before
 * `<kind>/<name>`. A bare (no-slash) project — the provisional, not-yet-owner-qualified
 * state (067 D-002) — degrades to a single-segment authority with no extra path prefix.
 *
 * The kind is a PARAMETER rather than a hardcoded segment so a second kind needs no
 * second composer: one authority rule, applied identically, which is what keeps a
 * contract coordinate and a spec coordinate from drifting apart (D-001).
 *
 * Pure: no fs, no clock, no environment (NFR-001) — identical input, identical output.
 */
export function resourceUri(project: string, kind: ResourceKind, name: string, anchor?: string): string {
  const slashIndex = project.indexOf('/');
  const authority = slashIndex === -1 ? project : project.slice(0, slashIndex);
  const rest = slashIndex === -1 ? '' : project.slice(slashIndex + 1);
  const path = rest ? `${rest}/${kind}/${name}` : `${kind}/${name}`;
  const fragment = anchor ? `#${anchor}` : '';
  return `spectastic://${authority}/${path}${fragment}`;
}

/**
 * Compose a spec's resource URI: `spectastic://<owner>/<repo…>/spec/<spec-id>#<anchor>`.
 * A thin wrapper over `resourceUri` (076 D-001) — kept so 067's callers are untouched,
 * and so the spec kind keeps a name at the call site rather than a string literal.
 */
export function specResourceUri(project: string, specId: string, anchor?: string): string {
  return resourceUri(project, 'spec', specId, anchor);
}

/**
 * Compose a contract's resource URI:
 * `spectastic://<owner>/<repo…>/contract/<name>#<anchor>`.
 *
 * Takes the contract's stable NAME, never its path (076 SC-002): a coordinate names
 * what a contract *is*, not where its file currently sits, so a producer
 * reorganising its own repository cannot break a consumer that pinned one. The
 * signature has no path parameter at all, which makes that structural rather than a
 * rule someone must remember.
 */
export function contractResourceUri(project: string, name: string, anchor?: string): string {
  return resourceUri(project, 'contract', name, anchor);
}
