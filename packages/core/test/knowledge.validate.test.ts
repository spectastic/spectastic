import { describe, expect, it } from 'vitest';
import { corpusWellFormedFindings } from '../src/knowledge/validate.js';
import type { CorpusDocument, CorpusPack, IndexEntry } from '../src/knowledge/types.js';

/**
 * 051-knowledge-corpus T-100: red-first tests for corpusWellFormedFindings —
 * required fields present, index<->file bidirectional integrity, and
 * KB-NNN uniqueness (plan D-003, folded into `spectastic validate` by T-112,
 * never a schema-registry rule since the corpus is plain markdown).
 */

const FULL_PROVENANCE = {
  origin: 'SEC release 34-99999',
  'origin-url': 'https://sec.gov/example',
  edition: '2024-05-28',
  license: 'CC-BY-4.0',
  converter: 'hand-authored',
  'content-hash': 'sha256:abc',
  status: 'illustrative-excerpt',
};

function doc(overrides: Partial<CorpusDocument> = {}): CorpusDocument {
  return {
    id: 'KB-001',
    hasFrontmatter: true,
    missingFields: [],
    provenance: { ...FULL_PROVENANCE },
    body: 'body',
    filePath: 'knowledge/pack/references/KB-001-x.md',
    ...overrides,
  };
}

function entry(overrides: Partial<IndexEntry> = {}): IndexEntry {
  return {
    id: 'KB-001',
    title: 'Title',
    description: 'Desc',
    edition: '2024-05-28',
    path: 'references/KB-001-x.md',
    ...overrides,
  };
}

function pack(overrides: Partial<CorpusPack> = {}): CorpusPack {
  return {
    name: 'pack',
    dirPath: 'knowledge/pack',
    hasSkillFile: true,
    index: [entry()],
    documents: [doc()],
    ...overrides,
  };
}

describe('corpusWellFormedFindings', () => {
  it('returns no findings for a fully well-formed pack', () => {
    expect(corpusWellFormedFindings([pack()])).toEqual([]);
  });

  it('returns no findings for an empty corpus', () => {
    expect(corpusWellFormedFindings([])).toEqual([]);
  });

  it('flags a document missing a required field', () => {
    const bad = doc({
      missingFields: ['license'],
      provenance: { ...FULL_PROVENANCE, license: undefined },
    });
    const findings = corpusWellFormedFindings([pack({ documents: [bad] })]);
    expect(
      findings.some((f) => f.rule === 'corpus-well-formed' && f.message.includes('license')),
    ).toBe(true);
  });

  it('flags a dangling index row with no matching document', () => {
    const danglingEntry = entry({ id: 'KB-002', path: 'references/KB-002-missing.md' });
    const findings = corpusWellFormedFindings([pack({ index: [danglingEntry], documents: [] })]);
    expect(
      findings.some((f) => f.rule === 'corpus-well-formed' && f.message.includes('KB-002')),
    ).toBe(true);
  });

  it('flags an orphan reference file with no matching index row', () => {
    const orphanDoc = doc({ id: 'KB-003', filePath: 'knowledge/pack/references/KB-003-orphan.md' });
    const findings = corpusWellFormedFindings([pack({ index: [], documents: [orphanDoc] })]);
    expect(
      findings.some((f) => f.rule === 'corpus-well-formed' && f.message.includes('KB-003')),
    ).toBe(true);
  });

  it('flags two documents sharing one KB-NNN id', () => {
    const dupA = doc({ filePath: 'knowledge/pack/references/a.md' });
    const dupB = doc({ filePath: 'knowledge/pack/references/b.md' });
    const findings = corpusWellFormedFindings([
      pack({ index: [entry(), entry({ path: 'references/b.md' })], documents: [dupA, dupB] }),
    ]);
    expect(
      findings.some(
        (f) =>
          f.rule === 'corpus-well-formed' &&
          f.message.includes('KB-001') &&
          f.message.toLowerCase().includes('duplicate'),
      ),
    ).toBe(true);
  });
});
