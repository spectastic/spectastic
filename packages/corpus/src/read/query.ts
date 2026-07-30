import type { CorpusPack, RegistryEntry } from '../knowledge/types.js';

/**
 * query<term> — a case-insensitive substring match over metadata fields, never document
 * bodies (that's grep's job) and never embeddings (064-corpus-package-extraction, US3, FR-005).
 * Searches both a pack's own curated index (id/title/description) and the root registry
 * (id/slug/title), so a corpus is fully searchable whether or not it has migrated onto the
 * two-layer identity model. Deduped by id (a registry hit never shadows a pack-index hit for
 * the same id), sorted for deterministic output.
 */
export interface QueryHit {
  id: string;
  title: string;
  description?: string;
  edition: string;
  path: string;
}

export function query(term: string, packs: readonly CorpusPack[], registry: readonly RegistryEntry[] = []): QueryHit[] {
  const needle = term.toLowerCase();
  const hits = new Map<string, QueryHit>();

  for (const pack of packs) {
    for (const entry of pack.index) {
      const haystack = `${entry.id} ${entry.title} ${entry.description}`.toLowerCase();
      if (!haystack.includes(needle)) continue;
      hits.set(entry.id, {
        id: entry.id,
        title: entry.title,
        description: entry.description,
        edition: entry.edition,
        path: entry.path,
      });
    }
  }

  for (const entry of registry) {
    if (hits.has(entry.id)) continue;
    const haystack = `${entry.id} ${entry.slug} ${entry.title}`.toLowerCase();
    if (!haystack.includes(needle)) continue;
    hits.set(entry.id, {
      id: entry.id,
      title: entry.title,
      edition: entry.edition,
      path: entry.path,
    });
  }

  return [...hits.values()].sort((a, b) => a.id.localeCompare(b.id));
}
