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
 */
import type { CorpusCitation } from '@spectastic/schema/citation';
import type { CorpusPack, ResolvedCitation } from './types.js';

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
    return { id: doc.id, edition: current ?? '', kind: 'current', filePath: doc.filePath, provenance: doc.provenance };
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
    return { id: prior.id, edition: prior.edition, kind: 'superseded', filePath: prior.filePath, provenance: prior.provenance };
  }
  return null;
}

export function resolveCitation(
  packs: readonly CorpusPack[],
  citation: CorpusCitation,
): ResolvedCitation | null {
  for (const pack of packs) {
    const current = matchCurrent(pack, citation);
    if (current) return current;
    const superseded = matchSuperseded(pack, citation);
    if (superseded) return superseded;
  }
  return null;
}
