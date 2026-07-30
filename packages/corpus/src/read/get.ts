import { parseCorpusCitation } from '@spectastic/schema/citation';
import { renderCitationLabel, resolveCitation } from '../knowledge/index.js';
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

  // An empty registry falls through to the full pack scan inside resolveCitation
  // (it guards on `registry.length > 0`), so the array can be passed straight through.
  const resolved = resolveCitation(packs, citation, registry);
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
