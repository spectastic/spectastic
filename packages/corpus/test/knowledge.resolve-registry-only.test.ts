import { describe, expect, it } from 'vitest';
import { resolveCitation } from '../src/knowledge/resolve.js';
import type { CorpusDocument, CorpusPack, RegistryEntry, SupersededEdition } from '../src/knowledge/types.js';

/**
 * 062-corpus-identity-migration US3 (FR-006/FR-007, SC-002): once the root
 * registry is populated, it is the SOLE authority for a current-edition
 * match. The array-order pack-scan `matchCurrent` fallback is retired WHEN A
 * REGISTRY IS PRESENT — so a current-edition citation can never again resolve
 * by a pack's position in an array (D-002). The no-registry path is unchanged
 * (the documented back-compat window for callers that haven't loaded a
 * registry), and an edition-pinned SUPERSEDED citation still resolves via the
 * narrow pack lookup that survives the flip (FR-007 preserves 052 FR-003).
 */

const PROV = {
  origin: 'x',
  'origin-url': 'https://x',
  license: 'CC-BY-4.0',
  converter: 'hand-authored',
  'content-hash': 'sha256:x',
  status: 'illustrative-excerpt',
};

/** A legacy-shaped pack still carrying a document `id` — the shape whose
 * array-order resolution the flip exists to retire. */
function packWithCurrentId(name: string, id: string, edition: string): CorpusPack {
  const doc: CorpusDocument = {
    id,
    hasFrontmatter: true,
    missingFields: [],
    provenance: { ...PROV, edition },
    body: `body of ${name}`,
    filePath: `knowledge/${name}/references/${id}-x.md`,
  };
  return {
    name,
    dirPath: `knowledge/${name}`,
    hasSkillFile: true,
    index: [],
    documents: [doc],
  };
}

function packWithSuperseded(): CorpusPack {
  const current: CorpusDocument = {
    id: 'KB-0002',
    hasFrontmatter: true,
    missingFields: [],
    provenance: { ...PROV, edition: '2024-05-28' },
    body: 'T+1',
    filePath: 'knowledge/finance/references/001-settlement.md',
  };
  const prior: SupersededEdition = {
    id: 'KB-0002',
    edition: '2017-09-05',
    filePath: 'knowledge/finance/references/superseded/001-settlement@2017-09-05.md',
    provenance: { ...PROV, edition: '2017-09-05' },
  };
  return {
    name: 'finance',
    dirPath: 'knowledge/finance',
    hasSkillFile: true,
    index: [],
    documents: [current],
    supersededEditions: [prior],
  };
}

function registryRow(id: string, path: string, edition = '2026-01-01'): RegistryEntry {
  return {
    id,
    marketplace: 'acme',
    plugin: 'finance-settlement',
    slug: '001-settlement-windows',
    title: 'Settlement windows',
    edition,
    path,
  };
}

describe('resolveCitation — registry is the sole current-edition authority (062 US3, FR-006/SC-002)', () => {
  it('resolves a registry hit by identity across two colliding packs, never by array order', () => {
    const packA = packWithCurrentId('spectastic-concepts', 'KB-0007', '2026-01-01');
    const packB = packWithCurrentId('finance-settlement', 'KB-0007', '2026-01-01');
    const row = registryRow('KB-0007', 'knowledge/finance-settlement/references/001-settlement-windows.md');
    const r = resolveCitation([packA, packB], { id: 'KB-0007', edition: '2026-01-01' }, [row]);
    expect(r?.kind).toBe('current');
    expect(r?.filePath).toBe(row.path); // the registry's path, not packA's (array-order) path
  });

  it('does NOT fall back to array-order matchCurrent when a registry is present but has no matching row', () => {
    // The retired back-compat behaviour: with a registry loaded, a current-edition id
    // absent from it must NOT resolve via the pack scan's matchCurrent (FR-006).
    const packA = packWithCurrentId('legacy', 'KB-0009', '2024-05-28');
    const r = resolveCitation([packA], { id: 'KB-0009', edition: '2024-05-28' }, [registryRow('KB-0007', 'p')]);
    expect(r).toBeNull();
  });

  it('still resolves an edition-pinned SUPERSEDED citation via the pack lookup that survives the flip (FR-007)', () => {
    const row = registryRow('KB-0002', 'knowledge/finance/references/001-settlement.md', '2024-05-28');
    const r = resolveCitation([packWithSuperseded()], { id: 'KB-0002', edition: '2017-09-05' }, [row]);
    expect(r?.kind).toBe('superseded');
    expect(r?.edition).toBe('2017-09-05');
    expect(r?.filePath).toContain('superseded');
  });

  it('leaves the no-registry path unchanged — a current edition still resolves via the pack scan', () => {
    const r = resolveCitation([packWithCurrentId('legacy', 'KB-0009', '2024-05-28')], {
      id: 'KB-0009',
      edition: '2024-05-28',
    });
    expect(r?.kind).toBe('current');
  });

  it('treats an EMPTY registry array as "no registry" — the pack scan still resolves (052 T-001)', () => {
    // loadRegistry() returns [] for any project with no root knowledge/index.md yet.
    // A bare `if (registry)` truthy check would treat that empty array as an
    // authoritative-but-empty registry and skip the pack scan, resolving to null.
    // The guard is `registry.length > 0`, so an empty array falls through to the scan.
    const r = resolveCitation(
      [packWithCurrentId('legacy', 'KB-0009', '2024-05-28')],
      { id: 'KB-0009', edition: '2024-05-28' },
      [],
    );
    expect(r?.kind).toBe('current');
  });
});
