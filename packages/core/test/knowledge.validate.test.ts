import { describe, expect, it } from 'vitest';
import { corpusWellFormedFindings, corpusRegistryFindings } from '../src/knowledge/validate.js';
import type { CorpusDocument, CorpusPack, IndexEntry, RegistryEntry } from '../src/knowledge/types.js';

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

  // T-1002 (2026-07-26-two-layer-corpus-identity): the pack-local slug check
  // is additive — a no-op for a pre-migration pack whose documents carry no
  // `slug` at all (the existing fixtures above never set one).

  it('is still a no-op for a pack with no slugs populated (pre-migration, additive)', () => {
    expect(corpusWellFormedFindings([pack()])).toEqual([]);
  });

  it('flags two documents sharing one pack-internal slug', () => {
    const dupA = doc({ id: 'KB-010', slug: '001-settlement-windows', filePath: 'knowledge/pack/references/a.md' });
    const dupB = doc({ id: 'KB-011', slug: '001-settlement-windows', filePath: 'knowledge/pack/references/b.md' });
    const findings = corpusWellFormedFindings([
      pack({
        index: [entry({ id: 'KB-010' }), entry({ id: 'KB-011', path: 'references/b.md' })],
        documents: [dupA, dupB],
      }),
    ]);
    expect(
      findings.some(
        (f) =>
          f.rule === 'corpus-well-formed' &&
          f.message.includes('001-settlement-windows') &&
          f.message.toLowerCase().includes('duplicate'),
      ),
    ).toBe(true);
  });

  it('does not confuse two documents with no slug for a slug collision', () => {
    const a = doc({ id: 'KB-010', filePath: 'knowledge/pack/references/a.md' });
    const b = doc({ id: 'KB-011', filePath: 'knowledge/pack/references/b.md' });
    const findings = corpusWellFormedFindings([
      pack({
        index: [entry({ id: 'KB-010' }), entry({ id: 'KB-011', path: 'references/b.md' })],
        documents: [a, b],
      }),
    ]);
    expect(findings.some((f) => f.message.toLowerCase().includes('slug'))).toBe(false);
  });
});

describe('corpusRegistryFindings (FR-009, the root registry)', () => {
  function registryRow(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
    return {
      id: 'KB-0001',
      marketplace: 'spectastic-examples',
      plugin: 'finance-settlement',
      slug: '001-settlement-windows',
      title: 'Settlement windows',
      edition: '2026-07-25',
      path: 'knowledge/finance-settlement/references/001-settlement-windows.md',
      ...overrides,
    };
  }

  it('returns no findings for a well-formed registry', () => {
    expect(corpusRegistryFindings([registryRow()])).toEqual([]);
  });

  it('is a no-op when no registry is present (empty entries)', () => {
    expect(corpusRegistryFindings([])).toEqual([]);
  });

  it('flags a row missing a required column', () => {
    const bad = registryRow({ title: '' });
    const findings = corpusRegistryFindings([bad]);
    expect(
      findings.some((f) => f.rule === 'corpus-well-formed' && f.message.includes('KB-0001') && f.message.includes('title')),
    ).toBe(true);
  });

  it('flags an id that is not shaped KB-NNNN (digits only) — a shape failure is an opaqueness failure', () => {
    // A pure-digit KB-NNNN cannot encode a name; embedding one requires
    // breaking the shape, so the shape check *is* the opaqueness check.
    const bad = registryRow({ id: 'KB-finance-settlement-0001' });
    const findings = corpusRegistryFindings([bad]);
    expect(
      findings.some(
        (f) =>
          f.message.includes('KB-finance-settlement-0001') &&
          f.message.toLowerCase().includes('opaque'),
      ),
    ).toBe(true);
  });

  it('accepts a plain KB-NNNN with no name embedded, of any digit width ≥ 3', () => {
    expect(corpusRegistryFindings([registryRow({ id: 'KB-42000' })])).toEqual([]);
  });

  it('flags two registry rows sharing one KB-NNNN (the cross-pack collision this amendment fixes)', () => {
    const rowA = registryRow({ path: 'knowledge/pack-a/references/001-a.md' });
    const rowB = registryRow({ plugin: 'other-pack', path: 'knowledge/pack-b/references/001-b.md' });
    const findings = corpusRegistryFindings([rowA, rowB]);
    expect(
      findings.some(
        (f) => f.message.includes('KB-0001') && f.message.toLowerCase().includes('duplicate'),
      ),
    ).toBe(true);
  });

  /**
   * 2026-07-26 061-corpus-ingester T-203 (FR-007): an orphaned row warns —
   * loud, but never blocks a build (mirroring 052's corpus-staleness, not
   * corpus-provenance). It's never dropped from `entries` either way; this
   * is purely about the finding it raises.
   */
  it('warns exactly once on a row with status=orphaned', () => {
    const row = registryRow({ status: 'orphaned' });
    const findings = corpusRegistryFindings([row]);
    const orphanFindings = findings.filter((f) => f.message.toLowerCase().includes('orphan'));
    expect(orphanFindings).toHaveLength(1);
    expect(orphanFindings[0]?.severity).toBe('warning');
    expect(orphanFindings[0]?.message).toContain('KB-0001');
  });

  it('does not warn on a current (non-orphaned) row', () => {
    const findings = corpusRegistryFindings([registryRow({ status: '' })]);
    expect(findings.filter((f) => f.message.toLowerCase().includes('orphan'))).toEqual([]);
  });
});
