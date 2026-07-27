import { parseCorpusCitation } from '@spectastic/schema/citation';
import { resolveCitation, renderCitationLabel } from '../knowledge/index.js';
import type { CorpusPack, RegistryEntry } from '../knowledge/types.js';

/**
 * get<id> — a thin shim over the existing citation resolver (064-corpus-package-extraction,
 * US3, FR-005). A bare id resolves to the current document; an edition-pinned id
 * (`KB-NNN@edition`) must match exactly or a retained superseded edition. A malformed id,
 * an unknown id, or an edition mismatch is a defined not-found — never a throw
 * (FR-007 graceful absence extends to the read path too).
 */
export interface GetResult {
  found: boolean;
  id?: string;
  edition?: string;
  kind?: 'current' | 'superseded';
  filePath?: string;
  /** The human-readable marketplace · plugin · slug coordinate, when the registry
   * carries one — null when the registry has no row for this id (not an error, per
   * renderCitationLabel's own contract). */
  label?: string | null;
}

export function get(idOrCitation: string, packs: readonly CorpusPack[], registry: readonly RegistryEntry[]): GetResult {
  const citation = parseCorpusCitation(idOrCitation);
  if (!citation) return { found: false };

  // resolveCitation checks `if (registry)`, and an empty array is truthy — passing one
  // through (as loadRegistry() returns for any project with no root registry file yet)
  // would silently switch to registry-only resolution and skip the full pack scan, even
  // though the function's own contract says "no registry" preserves it. A pre-existing
  // sharp edge in the moved (unchanged) resolver, found via this new caller; worked around
  // here rather than touched there — flagged for triage, not fixed inline.
  const resolved = resolveCitation(packs, citation, registry.length > 0 ? registry : undefined);
  if (!resolved) return { found: false };

  return {
    found: true,
    id: resolved.id,
    edition: resolved.edition,
    kind: resolved.kind,
    filePath: resolved.filePath,
    label: renderCitationLabel(resolved.id, registry),
  };
}
