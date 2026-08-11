import { describe, expect, it } from 'vitest';
import {
  registryEntryUri,
  renderCitationLabel,
  resolveCitation,
  resolveCorpusCoordinate,
} from '../src/knowledge/resolve.js';
import type { CorpusDocument, CorpusPack, RegistryEntry, SupersededEdition } from '../src/knowledge/types.js';
import { DEDUPE_REPOS } from './fixtures/dedupe/index.js';

/**
 * 052-corpus-citation-contract T-201: red-first tests for resolveCitation
 * (plan D-003, FR-003, SC-002). A pinned citation resolves to the current
 * document when the edition matches, to a retained superseded edition when
 * it matches a prior one, and to null when the id or edition is unknown.
 */

const PROV = {
  origin: 'x',
  'origin-url': 'https://x',
  license: 'CC-BY-4.0',
  converter: 'hand-authored',
  'content-hash': 'sha256:x',
  status: 'illustrative-excerpt',
};

function currentDoc(): CorpusDocument {
  return {
    id: 'KB-001',
    hasFrontmatter: true,
    missingFields: [],
    provenance: { ...PROV, edition: '2024-05-28' },
    body: 'T+1',
    filePath: 'knowledge/finance/references/KB-001-settlement.md',
  };
}

function prior(): SupersededEdition {
  return {
    id: 'KB-001',
    edition: '2017-09-05',
    filePath: 'knowledge/finance/references/superseded/KB-001-settlement@2017-09-05.md',
    provenance: { ...PROV, edition: '2017-09-05' },
  };
}

function pack(): CorpusPack {
  return {
    name: 'finance',
    dirPath: 'knowledge/finance',
    hasSkillFile: true,
    index: [],
    documents: [currentDoc()],
    supersededEditions: [prior()],
  };
}

describe('resolveCitation (052 T-201, SC-002)', () => {
  it('resolves a citation matching the current edition to the current document', () => {
    const r = resolveCitation([pack()], {
      id: 'KB-001',
      edition: '2024-05-28',
    });
    expect(r?.kind).toBe('current');
    expect(r?.filePath).toBe('knowledge/finance/references/KB-001-settlement.md');
  });

  it('resolves a citation matching a superseded edition to the retained copy (no dangling reference)', () => {
    const r = resolveCitation([pack()], {
      id: 'KB-001',
      edition: '2017-09-05',
    });
    expect(r?.kind).toBe('superseded');
    expect(r?.edition).toBe('2017-09-05');
    expect(r?.filePath).toContain('superseded');
  });

  it('resolves a bare (unpinned) citation to the current document', () => {
    const r = resolveCitation([pack()], { id: 'KB-001', edition: null });
    expect(r?.kind).toBe('current');
  });

  it('returns null for an unknown id', () => {
    expect(resolveCitation([pack()], { id: 'KB-999', edition: '2024-05-28' })).toBeNull();
  });

  it('returns null for a known id at an unknown edition', () => {
    expect(resolveCitation([pack()], { id: 'KB-001', edition: '1999-01-01' })).toBeNull();
  });

  it('returns null against an empty corpus', () => {
    expect(resolveCitation([], { id: 'KB-001', edition: '2024-05-28' })).toBeNull();
  });
});

/**
 * 2026-07-26-hybrid-corpus-citation T-1000: registry-first resolution. A
 * `KB-NNNN` present in the root registry resolves there BEFORE the pack scan
 * runs — ending the first-pack-wins array-order collision two packs sharing
 * an id would otherwise hit. The registry argument is optional and additive:
 * every pre-existing call above (no registry passed) is untouched.
 */
describe('resolveCitation — registry-first resolution (T-1000, 2026-07-26-hybrid-corpus-citation)', () => {
  function collidingPack(name: string, filePath: string): CorpusPack {
    return {
      name,
      dirPath: `knowledge/${name}`,
      hasSkillFile: true,
      index: [],
      documents: [
        {
          id: 'KB-0007',
          hasFrontmatter: true,
          missingFields: [],
          provenance: { edition: '2026-01-01' },
          body: `body of ${name}`,
          filePath,
        },
      ],
    };
  }

  function registryRow(): RegistryEntry {
    return {
      id: 'KB-0007',
      marketplace: 'acme',
      plugin: 'finance-settlement',
      slug: '001-settlement-windows',
      title: 'Settlement windows',
      edition: '2026-01-01',
      path: 'knowledge/finance-settlement/references/001-settlement-windows.md',
    };
  }

  it('resolves a registry hit before scanning packs at all, deterministically over array order', () => {
    const packA = collidingPack('spectastic-concepts', 'knowledge/spectastic-concepts/references/KB-0007-x.md');
    const packB = collidingPack(
      'finance-settlement',
      'knowledge/finance-settlement/references/001-settlement-windows.md',
    );
    const r = resolveCitation([packA, packB], { id: 'KB-0007', edition: '2026-01-01' }, [registryRow()]);
    expect(r?.kind).toBe('current');
    expect(r?.filePath).toBe(registryRow().path);
  });

  it('does NOT fall back to array-order matchCurrent when a registry is present but lacks the row (062 FR-006 retired the back-compat fallback)', () => {
    // Was: with a registry present but no matching row, resolution fell back to
    // the pack scan's matchCurrent (the 052 back-compat window). 062 US3 closes
    // that window — a loaded registry is the sole current-edition authority, so
    // a current-edition id absent from it resolves to null, never by array order.
    const r = resolveCitation([pack()], { id: 'KB-001', edition: '2024-05-28' }, [registryRow()]);
    expect(r).toBeNull();
  });

  it('falls back to the pack scan when no registry argument is passed at all', () => {
    const r = resolveCitation([pack()], {
      id: 'KB-001',
      edition: '2024-05-28',
    });
    expect(r?.kind).toBe('current');
  });

  it('falls back to the pack scan when the registry row is at a different edition than cited', () => {
    const packA = collidingPack('spectastic-concepts', 'knowledge/spectastic-concepts/references/KB-0007-x.md');
    const r = resolveCitation([packA], { id: 'KB-0007', edition: '2099-01-01' }, [registryRow()]);
    expect(r).toBeNull();
  });

  it('a bare citation resolves against the registry too', () => {
    const r = resolveCitation([], { id: 'KB-0007', edition: null }, [registryRow()]);
    expect(r?.kind).toBe('current');
    expect(r?.filePath).toBe(registryRow().path);
  });
});

/**
 * 2026-07-26-hybrid-corpus-citation T-1002: renderCitationLabel (FR-006). A
 * render/validate layer's human-readable label for an opaque KB-NNNN, read
 * from the registry row at render time only — never stored in the token.
 */
describe('renderCitationLabel (T-1002, FR-006)', () => {
  const row: RegistryEntry = {
    id: 'KB-0007',
    marketplace: 'acme',
    plugin: 'finance-settlement',
    slug: '001-settlement-windows',
    title: 'Settlement windows',
    edition: '2026-01-01',
    path: 'knowledge/finance-settlement/references/001-settlement-windows.md',
  };

  it('renders marketplace · plugin · slug when all three are present', () => {
    expect(renderCitationLabel('KB-0007', [row])).toBe('acme · finance-settlement · 001-settlement-windows');
  });

  it('falls back to title when marketplace, plugin, or slug is blank', () => {
    const partial = { ...row, plugin: '' };
    expect(renderCitationLabel('KB-0007', [partial])).toBe('Settlement windows');
  });

  it('returns null when neither the composite fields nor a title are available', () => {
    const bare = { ...row, plugin: '', title: '' };
    expect(renderCitationLabel('KB-0007', [bare])).toBeNull();
  });

  it('returns null when the registry has no row for the id (absent registry / not-yet-imported, FR-006 no-op)', () => {
    expect(renderCitationLabel('KB-9999', [row])).toBeNull();
    expect(renderCitationLabel('KB-0007', [])).toBeNull();
  });
});

/**
 * 078-federated-resource-uri T-202: red-first test for the foreign-
 * coordinate contract (FR-006, SC-004) — a coordinate naming a marketplace
 * absent locally parses successfully (proven at the schema layer, T-201);
 * the SEPARATE local-resolve step reports absence, never an error.
 */
describe('resolveCorpusCoordinate — the local-resolve half of FR-006 (078 T-211)', () => {
  const [repoA] = DEDUPE_REPOS;
  if (!repoA) throw new Error('DEDUPE_REPOS fixture is empty');

  it('resolves a coordinate this repository recognises', () => {
    const found = resolveCorpusCoordinate(repoA.entry.marketplace, repoA.entry.plugin, repoA.entry.slug, [repoA.entry]);
    expect(found).toEqual(repoA.entry);
  });

  it('reports absence — null, never a throw — for a marketplace this repository has never heard of', () => {
    expect(() =>
      resolveCorpusCoordinate('a-marketplace-nobody-has', 'some-pack', 'some-doc', [repoA.entry]),
    ).not.toThrow();
    expect(resolveCorpusCoordinate('a-marketplace-nobody-has', 'some-pack', 'some-doc', [repoA.entry])).toBeNull();
  });

  it('reports absence for an empty registry, never a throw', () => {
    expect(() =>
      resolveCorpusCoordinate(repoA.entry.marketplace, repoA.entry.plugin, repoA.entry.slug, []),
    ).not.toThrow();
    expect(resolveCorpusCoordinate(repoA.entry.marketplace, repoA.entry.plugin, repoA.entry.slug, [])).toBeNull();
  });

  it('matches case-insensitively — a lowercased incoming coordinate still finds a mixed-case registry row', () => {
    const [, repoB] = DEDUPE_REPOS;
    if (!repoB) throw new Error('DEDUPE_REPOS fixture missing repo B');
    // repoB.entry.marketplace is 'Spectastic' (mixed case); a coordinate
    // parsed off the wire always carries the lowercased form (D-004).
    const found = resolveCorpusCoordinate('spectastic', repoB.entry.plugin, repoB.entry.slug, [repoB.entry]);
    expect(found).toEqual(repoB.entry);
  });
});

/**
 * 078-federated-resource-uri T-300: the cross-repo dedupe proof (FR-009,
 * SC-001) — the same pack, read from the T-002 fixture under three
 * different (project, KB-NNNN, marketplace-casing) combinations, composes
 * to one byte-identical unpinned coordinate; a differing edition stays
 * distinct once pinned. No new implementation — proves the guarantee
 * registryEntryUri + corpusResourceUri's lowercase fold already establish.
 */
describe('cross-repo dedupe (078 T-300, FR-009/SC-001)', () => {
  it('the same pack under three repos — different project ids, different KB-NNNN, one mixed-case marketplace — yields one unpinned coordinate', () => {
    const unpinned = DEDUPE_REPOS.map((r) => registryEntryUri(r.entry));
    const [first, ...rest] = unpinned;
    for (const uri of rest) expect(uri, 'unpinned coordinates must match across repos').toBe(first);
  });

  it('a differing edition keeps a distinct PINNED coordinate even though the unpinned form matches', () => {
    const [repoA, repoB, repoC] = DEDUPE_REPOS;
    if (!repoA || !repoB || !repoC) throw new Error('DEDUPE_REPOS fixture incomplete');

    // A and B share an edition — their pinned coordinates match too.
    expect(registryEntryUri(repoA.entry, repoA.entry.edition)).toBe(registryEntryUri(repoB.entry, repoB.entry.edition));

    // C holds a different edition — its pinned coordinate must differ from A's,
    // even though their unpinned coordinates are identical.
    expect(registryEntryUri(repoC.entry, repoC.entry.edition)).not.toBe(
      registryEntryUri(repoA.entry, repoA.entry.edition),
    );
    expect(registryEntryUri(repoC.entry)).toBe(registryEntryUri(repoA.entry));
  });

  it('the coordinate never incorporates the locally-assigned KB-NNNN id, which is what makes the dedupe possible', () => {
    for (const r of DEDUPE_REPOS) {
      expect(registryEntryUri(r.entry)).not.toContain(r.entry.id);
    }
  });
});
