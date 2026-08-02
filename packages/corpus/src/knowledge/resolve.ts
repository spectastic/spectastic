/**
 * Resolve a corpus citation to the document it names (052-corpus-citation-
 * contract, T-212, FR-003, SC-002).
 *
 * A pinned citation (`KB-NNN@edition`) resolves to the current document when
 * the edition matches its provenance, or to a retained prior edition under
 * `references/superseded/` when it matches one — so an edition-pinned
 * citation to an older edition never dangles. A bare (unpinned) citation
 * resolves to the current document. An unknown id, or a known id at an
 * unknown edition, resolves to `null`.
 *
 * Takes the citation shape from `@spectastic/schema/citation` — the shared
 * grammar the `corpus-citation-form` rule also uses (plan D-001). Core
 * depends on schema, so this import is legal; the grammar itself never
 * depends on core.
 *
 * Registry-first resolution (2026-07-26-hybrid-corpus-citation, T-1000, FR-002
 * MODIFY): a `KB-NNNN` is post-migration project-assigned and repo-unique in
 * the root `knowledge/index.md` registry, so a registry hit is checked BEFORE
 * the pack scan — the pack scan alone is array-order-dependent and is exactly
 * the first-pack-wins collision the two-layer identity model exists to end.
 *
 * Registry is the sole current-edition authority (062-corpus-identity-
 * migration, FR-006): once a `registry` is passed, it is the ONLY source for a
 * current-edition match — the array-order `matchCurrent` pack fallback is
 * retired for that call, so a current edition can never resolve by a pack's
 * array position. An edition-pinned SUPERSEDED edition still resolves via the
 * packs (052 FR-003 / 062 FR-007), the one order-independent lookup the flip
 * keeps. When NO registry is passed the full pack scan is unchanged — the
 * documented back-compat path, closing entirely once the registry can record
 * superseded editions (`TBD-resolver-registry-only`).
 */
import type { CorpusCitation } from '@spectastic/schema/citation';
import { corpusResourceUri } from '@spectastic/schema/project';
import type { CorpusPack, RegistryEntry, ResolvedCitation } from './types.js';

/** True if a pinned citation edition matches (or the citation is bare). */
function editionMatches(citationEdition: string | null, edition: string | null): boolean {
  return citationEdition === null || citationEdition === edition;
}

/** The current document in a pack matching the citation, or null. A bare
 * citation, or one whose edition matches the live document, lands here. */
function matchCurrent(pack: CorpusPack, citation: CorpusCitation): ResolvedCitation | null {
  for (const doc of pack.documents) {
    if (doc.id !== citation.id) continue;
    const current = doc.provenance.edition ?? null;
    if (!editionMatches(citation.edition, current)) continue;
    return {
      id: doc.id,
      edition: current ?? '',
      kind: 'current',
      filePath: doc.filePath,
      provenance: doc.provenance,
    };
  }
  return null;
}

/** A retained prior edition in a pack matching the citation, or null. `?? []`
 * for the optional field — the loader always sets it, but a hand-built
 * CorpusPack literal (a test, a 051-era caller) may omit it. */
function matchSuperseded(pack: CorpusPack, citation: CorpusCitation): ResolvedCitation | null {
  for (const prior of pack.supersededEditions ?? []) {
    if (prior.id !== citation.id) continue;
    if (!editionMatches(citation.edition, prior.edition)) continue;
    return {
      id: prior.id,
      edition: prior.edition,
      kind: 'superseded',
      filePath: prior.filePath,
      provenance: prior.provenance,
    };
  }
  return null;
}

/** A registry row matching the citation, or null. The registry has no
 * separate superseded-editions collection of its own (an entry's `edition`
 * IS its current edition), so a hit is always `kind: 'current'`; a citation
 * pinned to an edition the registry has already moved past falls through to
 * null here and is picked up by the pack scan's own superseded match. The
 * registry doesn't carry a document's full provenance frontmatter — only
 * `edition` is known at this layer — so the synthesised `provenance` is
 * minimal by construction, not a parsing gap. */
function matchRegistry(registry: readonly RegistryEntry[], citation: CorpusCitation): ResolvedCitation | null {
  for (const entry of registry) {
    if (entry.id !== citation.id) continue;
    if (!editionMatches(citation.edition, entry.edition)) continue;
    return {
      id: entry.id,
      edition: entry.edition,
      kind: 'current',
      filePath: entry.path,
      provenance: { edition: entry.edition },
    };
  }
  return null;
}

export function resolveCitation(
  packs: readonly CorpusPack[],
  citation: CorpusCitation,
  registry?: readonly RegistryEntry[],
): ResolvedCitation | null {
  // An empty registry array means "no registry loaded" — `loadRegistry()` returns
  // `[]` for any project with no root `knowledge/index.md` yet, and a bare truthy
  // check (`if (registry)`) would treat that as an authoritative-but-empty registry,
  // skipping the pack-scan back-compat path below and resolving every citation to
  // null. Guarding on length keeps the documented contract: no rows → full pack scan.
  if (registry && registry.length > 0) {
    const fromRegistry = matchRegistry(registry, citation);
    if (fromRegistry) return fromRegistry;
    // 062-corpus-identity-migration FR-006: with a registry loaded, it is the
    // SOLE authority for a current-edition match — the array-order
    // `matchCurrent` pack fallback is retired, so a current-edition citation
    // can never again resolve by a pack's position in an array. Only an
    // edition-pinned SUPERSEDED edition still resolves via the packs (052
    // FR-003 / 062 FR-007), because the registry records no prior editions of
    // its own; that narrow superseded lookup is order-independent by nature.
    for (const pack of packs) {
      const superseded = matchSuperseded(pack, citation);
      if (superseded) return superseded;
    }
    return null;
  }
  // No registry loaded: the documented back-compat path — the full pack scan,
  // unchanged, for a caller that hasn't loaded the root registry yet. The
  // window closes entirely once the registry can record superseded editions
  // and the pack scan is deleted (TBD-resolver-registry-only).
  for (const pack of packs) {
    const current = matchCurrent(pack, citation);
    if (current) return current;
    const superseded = matchSuperseded(pack, citation);
    if (superseded) return superseded;
  }
  return null;
}

/**
 * Render a `KB-NNNN`'s human label from the registry (2026-07-26-hybrid-
 * corpus-citation, T-1002, FR-006) — its source `marketplace`, `plugin`, and
 * `slug`, or its `title` when any of those three is blank. Read at
 * render/validate time only, never stored in the citation token itself: the
 * persistent-identifier discipline is "no semantic meaning in the id, so a
 * rename can't rot a citation" (FR-006's rationale, docs/corpus-identity-
 * considerations.html D-003) — the token stays opaque, and only the label
 * beside it is mutable.
 *
 * Returns `null` when the registry has no row for the id — an absent
 * registry (a plain-agent context, or a project whose corpus hasn't been
 * imported yet) is a no-op per FR-006, not a missing-label error; the caller
 * renders the bare opaque token in that case.
 */
export function renderCitationLabel(id: string, registry: readonly RegistryEntry[]): string | null {
  const entry = registry.find((row) => row.id === id);
  if (!entry) return null;
  if (entry.marketplace && entry.plugin && entry.slug) {
    return `${entry.marketplace} · ${entry.plugin} · ${entry.slug}`;
  }
  return entry.title || null;
}

/**
 * Render a registry row's federation-unique corpus coordinate
 * (078-federated-resource-uri, T-111, FR-001/FR-002/FR-003).
 *
 * Uses the row's OWN `marketplace` field as the authority — never a
 * separately-resolved `resolveCorpusConfig(cwd).marketplace` — because a
 * registry row's `marketplace` is already the document's origin provenance
 * ("the source marketplace… this reference was imported from", per
 * `RegistryEntry`'s own docstring), which can genuinely differ from this
 * repository's own publish identity when a project imports a pack from
 * elsewhere. FR-009's dedupe guarantee follows the document's origin, not
 * whichever repository happens to be querying it — so the row already
 * carries the correct authority, and re-resolving the local config would be
 * both unnecessary and, for an imported pack, actually wrong.
 *
 * `edition` is the caller's choice, not derived from the row: omit it (or
 * pass `undefined`) for the unpinned, current coordinate; pass the row's
 * `edition` field explicitly to pin. Mirrors `get`'s own bare-vs-pinned
 * distinction — an id resolved as bare renders unpinned; one resolved as
 * `KB-NNNN@edition` renders pinned.
 */
export function registryEntryUri(entry: RegistryEntry, edition?: string): string {
  return corpusResourceUri(entry.marketplace, entry.plugin, entry.slug, undefined, edition);
}

/**
 * Resolve a corpus coordinate's `(marketplace, plugin, slug)` against the
 * local registry (078-federated-resource-uri, T-211, FR-006).
 *
 * The deliberately separate half of FR-006: `parseResourceUri` (the schema
 * grammar) succeeds for ANY well-formed coordinate, whether or not this
 * repository has ever heard of the marketplace it names — parsing is pure
 * grammar with no knowledge of the repository around it. THIS function is
 * the local half — it looks the parsed marketplace/plugin/slug up against
 * what this repository's registry actually has, and returns `null` rather
 * than throwing when there is no match. Two operations, two failure modes:
 * a malformed coordinate fails to parse; a well-formed but foreign one
 * parses fine and simply resolves to nothing here.
 *
 * Marketplace comparison is case-insensitive: a coordinate read off the
 * wire always carries a lowercased marketplace segment (`corpusResourceUri`
 * folds it, D-004), but a registry row's own `marketplace` field is stored
 * exactly as imported and may be mixed-case — so a straight `===` would
 * silently miss a real match. Plugin and slug are NOT case-folded; they are
 * not federation-authority segments and the fold is deliberately scoped to
 * the one field where casing was proven (078 design §4 spike) to threaten
 * the dedupe guarantee.
 */
export function resolveCorpusCoordinate(
  marketplace: string,
  plugin: string,
  slug: string,
  registry: readonly RegistryEntry[],
): RegistryEntry | null {
  const wanted = marketplace.toLowerCase();
  const found = registry.find(
    (row) => row.marketplace.toLowerCase() === wanted && row.plugin === plugin && row.slug === slug,
  );
  return found ?? null;
}
