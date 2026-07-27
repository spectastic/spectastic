import { describe, expect, it } from 'vitest';
import { get } from '../src/read/get.js';
import type { CorpusPack, RegistryEntry } from '../src/knowledge/types.js';

/**
 * 064-corpus-package-extraction, US3 (T-300, FR-005): get<id> resolves one document via
 * the existing citation resolver (resolveCitation), returning coordinate + provenance.
 * A bare id resolves to the current document; an edition-pinned id must match; an
 * unknown id or a mismatched edition is a defined not-found, never a throw.
 */

function pack(overrides: Partial<CorpusPack> = {}): CorpusPack {
  return {
    name: 'example',
    dirPath: 'knowledge/example',
    hasSkillFile: true,
    index: [],
    documents: [
      {
        id: 'KB-501',
        filePath: 'knowledge/example/references/KB-501.md',
        provenance: { edition: '2026-01-01' },
        missingFields: [],
        hasFrontmatter: true,
        body: 'Settles in one business day.',
      },
    ],
    supersededEditions: [],
    ...overrides,
  };
}

const registry: RegistryEntry[] = [
  {
    id: 'KB-501',
    marketplace: 'acme',
    plugin: 'finance',
    slug: 'settlement-window',
    title: 'Settlement window',
    edition: '2026-01-01',
    path: 'knowledge/example/references/KB-501.md',
    status: '',
  },
];

describe('get (064, T-300)', () => {
  it('resolves a bare id to the current document', () => {
    const result = get('KB-501', [pack()], registry);
    expect(result.found).toBe(true);
    expect(result.id).toBe('KB-501');
    expect(result.edition).toBe('2026-01-01');
    expect(result.kind).toBe('current');
  });

  it('resolves an edition-pinned id that matches', () => {
    const result = get('KB-501@2026-01-01', [pack()], registry);
    expect(result.found).toBe(true);
  });

  it('is not-found for an edition-pinned id that does not match', () => {
    const result = get('KB-501@2025-01-01', [pack()], registry);
    expect(result.found).toBe(false);
  });

  it('is not-found for an unknown id', () => {
    const result = get('KB-999', [pack()], registry);
    expect(result.found).toBe(false);
  });

  it('is not-found (never throws) for a malformed id', () => {
    expect(() => get('not-a-citation', [pack()], registry)).not.toThrow();
    expect(get('not-a-citation', [pack()], registry).found).toBe(false);
  });

  it('carries the human label from the registry', () => {
    const result = get('KB-501', [pack()], registry);
    expect(result.label).toBe('acme · finance · settlement-window');
  });

  it('is a defined not-found on an empty corpus (FR-007 graceful absence)', () => {
    const result = get('KB-501', [], []);
    expect(result.found).toBe(false);
  });

  it('resolves against the pack scan when a corpus has no root registry yet (empty array, not undefined)', () => {
    // Regression: resolveCitation's `if (registry)` treats an empty array as "present",
    // which would otherwise silently skip pack-scan resolution — the common case for any
    // project that hasn't migrated onto the two-layer identity model (loadRegistry()
    // returns [] for a missing knowledge/index.md, not undefined).
    const result = get('KB-501', [pack()], []);
    expect(result.found).toBe(true);
    expect(result.id).toBe('KB-501');
  });
});
