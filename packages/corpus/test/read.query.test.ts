import { describe, expect, it } from 'vitest';
import { query } from '../src/read/query.js';
import type { CorpusPack, RegistryEntry } from '../src/knowledge/types.js';

/**
 * 064-corpus-package-extraction, US3 (T-301, FR-005): query<term> matches a case-insensitive
 * substring over metadata fields (id, slug, title, description) — never document bodies
 * (that's grep's job) and never embeddings. No match returns an empty array, not an error.
 */

function pack(overrides: Partial<CorpusPack> = {}): CorpusPack {
  return {
    name: 'example',
    dirPath: 'knowledge/example',
    hasSkillFile: true,
    index: [
      {
        id: 'KB-501',
        title: 'Settlement window',
        description: 'T+1 settlement fact',
        edition: '2026-01-01',
        path: 'knowledge/example/references/KB-501.md',
      },
    ],
    documents: [],
    supersededEditions: [],
    ...overrides,
  };
}

const registry: RegistryEntry[] = [
  {
    id: 'KB-777',
    marketplace: 'acme',
    plugin: 'finance',
    slug: 'fx-risk-guidance',
    title: 'FX settlement risk',
    edition: '2026-02-01',
    path: 'knowledge/other/references/KB-777.md',
    status: '',
  },
];

describe('query (064, T-301)', () => {
  it('matches a term in the title, case-insensitively', () => {
    const hits = query('SETTLEMENT', [pack()], []);
    expect(hits.map((h) => h.id)).toEqual(['KB-501']);
  });

  it('matches a term in the description', () => {
    const hits = query('T+1', [pack()], []);
    expect(hits.map((h) => h.id)).toEqual(['KB-501']);
  });

  it('matches a term in the id', () => {
    const hits = query('kb-501', [pack()], []);
    expect(hits.map((h) => h.id)).toEqual(['KB-501']);
  });

  it('matches a term in a registry row\'s slug', () => {
    const hits = query('fx-risk', [pack()], registry);
    expect(hits.map((h) => h.id)).toEqual(['KB-777']);
  });

  it('matches a term in a registry row\'s title', () => {
    const hits = query('FX settlement', [], registry);
    expect(hits.map((h) => h.id)).toEqual(['KB-777']);
  });

  it('returns hits from both a pack index and the registry, deduped by id, sorted', () => {
    const hits = query('settlement', [pack()], registry);
    expect(hits.map((h) => h.id)).toEqual(['KB-501', 'KB-777']);
  });

  it('returns an empty array (never throws) for no match', () => {
    expect(() => query('nonexistent-term-xyz', [pack()], registry)).not.toThrow();
    expect(query('nonexistent-term-xyz', [pack()], registry)).toEqual([]);
  });

  it('returns an empty array on an empty corpus (FR-007 graceful absence)', () => {
    expect(query('anything', [], [])).toEqual([]);
  });
});
