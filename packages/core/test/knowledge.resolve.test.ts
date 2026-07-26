import { describe, expect, it } from 'vitest';
import { resolveCitation } from '../src/knowledge/resolve.js';
import type { CorpusDocument, CorpusPack, SupersededEdition } from '../src/knowledge/types.js';

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
    const r = resolveCitation([pack()], { id: 'KB-001', edition: '2024-05-28' });
    expect(r?.kind).toBe('current');
    expect(r?.filePath).toBe('knowledge/finance/references/KB-001-settlement.md');
  });

  it('resolves a citation matching a superseded edition to the retained copy (no dangling reference)', () => {
    const r = resolveCitation([pack()], { id: 'KB-001', edition: '2017-09-05' });
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
