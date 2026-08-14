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
 * is the sibling kind added by spec 076-contract-export-handover (D-001); `corpus`
 * is 078-federated-resource-uri's addition (D-001) — the one closing the gap 067
 * explicitly deferred ("rendering corpus resources as spectastic:// URIs … ships
 * with the serving surface"); `unit` is 079-unit-dependency-edge's addition
 * (D-004), naming a module or a whole project so a dependency edge can address
 * both ends the same way.
 *
 * ONE declaration (078 FR-013). Until this collapse the static type and the
 * runtime set below were two separate enumerations of the same members,
 * documented as "moving together" with nothing that made them: 079 widened
 * this list and the runtime set that gates the parser silently kept the old
 * one, which is exactly the failure the docstring warned about and did
 * nothing to prevent. `ResourceKind` and `KNOWN_KINDS` are now both derived
 * from this array, so there is one place to widen and one way to get it
 * wrong at compile or test time rather than none.
 */
export const RESOURCE_KINDS = ['spec', 'contract', 'corpus', 'unit'] as const;

/** Derived from {@link RESOURCE_KINDS} — never restated as a literal union. */
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/**
 * Compose the canonical, federation-unique resource URI for a project resource
 * (067 FR-004/D-004; generalised by 076 D-001; edition-pinning added by 078 D-001):
 * `spectastic://<owner>/<repo…>/<kind>/<name>?edition=<edition>#<anchor>`.
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
 * `anchor` stays the 4th positional parameter and `edition` is appended as an
 * optional 5th (078 FR-012, FR-003) — deliberately NOT inserted before `anchor` —
 * so every existing 4-argument call site (`specResourceUri`, `contractResourceUri`)
 * keeps compiling and rendering unchanged. Parameter order is independent of
 * rendered-string order: the query (`?edition=`) is emitted before the fragment
 * (`#anchor`) in the URI regardless of which argument came first in the call.
 * `edition` is encoded via `URLSearchParams`, the same platform primitive
 * `parseResourceUri` reads it back with (078 D-002) — composing and parsing share
 * one encoding authority rather than two hand-written ones that could drift apart.
 *
 * Pure: no fs, no clock, no environment (NFR-001) — identical input, identical output.
 */
export function resourceUri(
  project: string,
  kind: ResourceKind,
  name: string,
  anchor?: string,
  edition?: string,
): string {
  const slashIndex = project.indexOf('/');
  const authority = slashIndex === -1 ? project : project.slice(0, slashIndex);
  const rest = slashIndex === -1 ? '' : project.slice(slashIndex + 1);
  const path = rest ? `${rest}/${kind}/${name}` : `${kind}/${name}`;
  const query = edition ? `?${new URLSearchParams({ edition }).toString()}` : '';
  const fragment = anchor ? `#${anchor}` : '';
  return `spectastic://${authority}/${path}${query}${fragment}`;
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

/**
 * Compose a corpus document's resource URI:
 * `spectastic://<marketplace>/corpus/<plugin>/<slug>?edition=<edition>#<anchor>`.
 *
 * Two departures from `specResourceUri`/`contractResourceUri`, both from
 * 078-federated-resource-uri:
 *
 *  - The authority is the MARKETPLACE, never the project identity (FR-002) —
 *    even where the two happen to be the same string (067's unified
 *    derivation makes that the common case, not the rule). A pack installed
 *    in ten repositories is one body of knowledge; keying on the project
 *    would mint ten coordinates for it.
 *  - The marketplace is lowercased before rendering (D-004) — and ONLY
 *    here, never in the shared `resourceUri` a spec/contract coordinate
 *    also goes through (FR-012: their output is unchanged). A non-special
 *    URI scheme does not fold host case the way `https://` does, so without
 *    this fold two repositories spelling their marketplace differently
 *    (`Acme-Corp` vs `acme-corp`) would produce two coordinates for what is
 *    structurally the same document — defeating FR-009's dedupe guarantee.
 *
 * `plugin`/`slug` become the path's name segment as `<plugin>/<slug>` —
 * `resourceUri` treats it as one opaque name segment string; splitting it
 * back into two parts is `parseResourceUri`'s job (078 D-002 companion).
 */
export function corpusResourceUri(
  marketplace: string,
  plugin: string,
  slug: string,
  anchor?: string,
  edition?: string,
): string {
  return resourceUri(marketplace.toLowerCase(), 'corpus', `${plugin}/${slug}`, anchor, edition);
}

/** The closed set of kinds `parseResourceUri` recognises. Built from
 * {@link RESOURCE_KINDS} rather than a second literal — the whole point of
 * the collapse is that there is nowhere left to enumerate the members twice. */
const KNOWN_KINDS: ReadonlySet<ResourceKind> = new Set(RESOURCE_KINDS);

/** A `spectastic://` URI parsed back into the coordinate it names
 * (078-federated-resource-uri, D-002). `project` is the reconstructed
 * project/marketplace identity — authority plus any subgroup path segments
 * before the kind — and `name` is everything after the kind, joined by `/`
 * (a bare id for spec/contract, `plugin/slug` for corpus). */
export interface ParsedResourceUri {
  kind: ResourceKind;
  project: string;
  name: string;
  edition?: string;
  anchor?: string;
}

/** `parseResourceUri`'s result — a discriminated union so a failure can
 * never carry a partially-populated `value` (FR-007). */
export type ParseResourceUriResult = { ok: true; value: ParsedResourceUri } | { ok: false; reason: string };

/**
 * Parse any `spectastic://` resource URI — spec, contract, or corpus — back
 * into the coordinate it names (078-federated-resource-uri, T-210,
 * FR-005/FR-006/FR-007/FR-008/D-002).
 *
 * Delegates to the platform `URL` for scheme/host/query/fragment parsing —
 * spike-verified (078 design §4) to parse `spectastic://` correctly and
 * round-trip byte-for-byte, including an owner-qualified authority. `URL`
 * is lenient by design, so this function does the validation `URL` won't:
 * confirming the scheme, and finding a recognised kind segment with at
 * least one name segment after it.
 *
 * The kind segment is the FIRST recognised kind literal encountered in the
 * path. A project/marketplace subgroup segment that happened to be spelled
 * exactly `spec`, `contract`, or `corpus` would collide with this — an
 * accepted, unsolved ambiguity (the grammar has no way to distinguish the
 * two), not a case this parser attempts to resolve.
 *
 * Never throws (FR-007): a malformed URI, a non-`spectastic:` scheme, a
 * missing authority, an unrecognised kind, or a kind with no name segment
 * after it all yield `{ ok: false }` rather than a thrown error or a
 * partially-populated value.
 *
 * Parsing succeeds for ANY well-formed coordinate regardless of whether the
 * project/marketplace it names is present locally (FR-006) — resolving a
 * parsed coordinate to a local artifact is a deliberately separate
 * operation (see `registryEntryUri`'s caller in `@spectastic/corpus`).
 *
 * Pure: no fs, no clock, no environment, no dereference of any kind
 * (NFR-001, NFR-002) — a URI submitted for parsing is untrusted data.
 */
export function parseResourceUri(input: string): ParseResourceUriResult {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: 'not a well-formed URI' };
  }
  if (url.protocol !== 'spectastic:') {
    return { ok: false, reason: `unrecognised scheme "${url.protocol}"` };
  }
  if (!url.host) {
    return { ok: false, reason: 'missing authority' };
  }

  const segments = url.pathname.split('/').filter((s) => s.length > 0);
  const kindIndex = segments.findIndex((s) => KNOWN_KINDS.has(s as ResourceKind));
  if (kindIndex === -1) {
    return { ok: false, reason: 'no recognised resource kind in path' };
  }

  const nameSegments = segments.slice(kindIndex + 1);
  if (nameSegments.length === 0) {
    return { ok: false, reason: 'missing resource name after kind' };
  }

  const restSegments = segments.slice(0, kindIndex);
  const project = restSegments.length > 0 ? `${url.host}/${restSegments.join('/')}` : url.host;
  const kind = segments[kindIndex] as ResourceKind;
  const name = nameSegments.join('/');
  const edition = url.searchParams.get('edition');
  const anchor = url.hash ? url.hash.slice(1) : '';

  return {
    ok: true,
    value: {
      kind,
      project,
      name,
      ...(edition ? { edition } : {}),
      ...(anchor ? { anchor } : {}),
    },
  };
}
