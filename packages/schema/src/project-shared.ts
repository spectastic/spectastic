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
 * Compose the canonical, federation-unique resource URI for a spec (FR-004, D-004):
 * `spectastic://<owner>/<repo…>/spec/<spec-id>#<anchor>`. Owner-as-authority — the
 * project identity's first `/`-delimited segment is the URI authority; everything after
 * it (if any) becomes leading path segments before `spec/<spec-id>`. A bare (no-slash)
 * project — the provisional, not-yet-owner-qualified state (plan D-002) — degrades to a
 * single-segment authority with no extra path prefix: `spectastic://<project>/spec/<id>`.
 * Pure: no fs, no clock, no environment (NFR-001) — identical input, identical output.
 */
export function specResourceUri(project: string, specId: string, anchor?: string): string {
  const slashIndex = project.indexOf('/');
  const authority = slashIndex === -1 ? project : project.slice(0, slashIndex);
  const rest = slashIndex === -1 ? '' : project.slice(slashIndex + 1);
  const path = rest ? `${rest}/spec/${specId}` : `spec/${specId}`;
  const fragment = anchor ? `#${anchor}` : '';
  return `spectastic://${authority}/${path}${fragment}`;
}
