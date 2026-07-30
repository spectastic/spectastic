import { describe, expect, it } from 'vitest';
import type { CorpusDocument, CorpusPack, IndexEntry, RegistryEntry } from '../src/knowledge/types.js';
import { corpusRegistryFindings, corpusWellFormedFindings } from '../src/knowledge/validate.js';

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
    // A genuinely well-formed pack, post-066, is two-layer: slug (never a
    // document id), no pack-local index — the shared `pack()`/`doc()`
    // defaults below stay single-layer-shaped deliberately (most of this
    // file's other checks are pre-migration-specific), so this one test
    // builds its own explicit two-layer fixture rather than relying on them.
    const twoLayer = pack({
      documents: [doc({ id: null, slug: '001-alpha' })],
      index: [],
    });
    expect(corpusWellFormedFindings([twoLayer])).toEqual([]);
  });

  it('returns no findings for an empty corpus', () => {
    expect(corpusWellFormedFindings([])).toEqual([]);
  });

  // 057-portable-domain-skill: "a pack MUST function as a plain Agent Skill
  // (SKILL.md + references/)". Enforcement had been missing — a pack of
  // references with no SKILL.md validated clean (065 triage T-003: convert
  // shipped exactly such a pack).
  it('flags a pack that has reference documents but no SKILL.md', () => {
    const findings = corpusWellFormedFindings([pack({ hasSkillFile: false })]);
    expect(findings.some((f) => f.rule === 'corpus-well-formed' && /SKILL\.md/.test(f.message))).toBe(true);
  });

  it('does NOT flag a missing SKILL.md on a pack with no documents (not yet a real pack)', () => {
    const findings = corpusWellFormedFindings([pack({ hasSkillFile: false, documents: [], index: [] })]);
    expect(findings.some((f) => /SKILL\.md/.test(f.message))).toBe(false);
  });

  it('flags a document missing a required field', () => {
    const bad = doc({
      missingFields: ['license'],
      provenance: { ...FULL_PROVENANCE, license: undefined },
    });
    const findings = corpusWellFormedFindings([pack({ documents: [bad] })]);
    expect(findings.some((f) => f.rule === 'corpus-well-formed' && f.message.includes('license'))).toBe(true);
  });

  it('flags a dangling index row with no matching document', () => {
    const danglingEntry = entry({
      id: 'KB-002',
      path: 'references/KB-002-missing.md',
    });
    const findings = corpusWellFormedFindings([pack({ index: [danglingEntry], documents: [] })]);
    expect(findings.some((f) => f.rule === 'corpus-well-formed' && f.message.includes('KB-002'))).toBe(true);
  });

  it('flags an orphan reference file with no matching index row', () => {
    const orphanDoc = doc({
      id: 'KB-003',
      filePath: 'knowledge/pack/references/KB-003-orphan.md',
    });
    const findings = corpusWellFormedFindings([pack({ index: [], documents: [orphanDoc] })]);
    expect(findings.some((f) => f.rule === 'corpus-well-formed' && f.message.includes('KB-003'))).toBe(true);
  });

  it('flags two documents sharing one KB-NNN id', () => {
    const dupA = doc({ filePath: 'knowledge/pack/references/a.md' });
    const dupB = doc({ filePath: 'knowledge/pack/references/b.md' });
    const findings = corpusWellFormedFindings([
      pack({
        index: [entry(), entry({ path: 'references/b.md' })],
        documents: [dupA, dupB],
      }),
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
    // The default `pack()` fixture is itself single-layer-shaped (066), so a
    // deprecation warning now legitimately fires on it — this test's own
    // claim is narrower: the SLUG-duplicate check specifically stays quiet.
    const findings = corpusWellFormedFindings([pack()]);
    expect(
      findings.some((f) => f.message.toLowerCase().includes('duplicate') && f.message.toLowerCase().includes('slug')),
    ).toBe(false);
  });

  it('flags two documents sharing one pack-internal slug', () => {
    const dupA = doc({
      id: 'KB-010',
      slug: '001-settlement-windows',
      filePath: 'knowledge/pack/references/a.md',
    });
    const dupB = doc({
      id: 'KB-011',
      slug: '001-settlement-windows',
      filePath: 'knowledge/pack/references/b.md',
    });
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
    expect(
      findings.some((f) => f.message.toLowerCase().includes('duplicate') && f.message.toLowerCase().includes('slug')),
    ).toBe(false);
  });

  // 066-corpus-single-layer-retire, US3: the deprecation warning (T-300/T-301).
  describe('single-layer deprecation warning (066, FR-004)', () => {
    it('warns (never errors) on a pack that still carries a single-layer document', () => {
      // The default `pack()`/`doc()` fixtures are single-layer-shaped: an
      // `id:` document with no `slug:`.
      const findings = corpusWellFormedFindings([pack()]);
      const warning = findings.find(
        (f) => f.severity === 'warning' && f.message.toLowerCase().includes('single-layer'),
      );
      expect(warning).toBeDefined();
      expect(warning!.message).toContain('corpus migrate');
      // Never an error — this phase is deprecate-first, not reject (NFR-002/D-003).
      expect(findings.some((f) => f.severity === 'error' && f.message.toLowerCase().includes('single-layer'))).toBe(
        false,
      );
    });

    it('warns on a pack whose only single-layer signal is a pack-local index.md (no id: document)', () => {
      // A migrated document (slug, no id) sitting alongside a leftover
      // pack-local index — still single-layer per D-003's OR clause.
      const migratedDoc = doc({ id: null, slug: '001-alpha' });
      const findings = corpusWellFormedFindings([pack({ documents: [migratedDoc], index: [entry()] })]);
      expect(findings.some((f) => f.severity === 'warning' && f.message.toLowerCase().includes('single-layer'))).toBe(
        true,
      );
    });

    it('is silent on a two-layer pack — no false positive, no new error (NFR-002)', () => {
      const twoLayer = pack({
        documents: [doc({ id: null, slug: '001-alpha' })],
        index: [],
      });
      const findings = corpusWellFormedFindings([twoLayer]);
      expect(findings).toEqual([]);
    });
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
      findings.some(
        (f) => f.rule === 'corpus-well-formed' && f.message.includes('KB-0001') && f.message.includes('title'),
      ),
    ).toBe(true);
  });

  it('flags an id that is not shaped KB-NNNN (digits only) — a shape failure is an opaqueness failure', () => {
    // A pure-digit KB-NNNN cannot encode a name; embedding one requires
    // breaking the shape, so the shape check *is* the opaqueness check.
    const bad = registryRow({ id: 'KB-finance-settlement-0001' });
    const findings = corpusRegistryFindings([bad]);
    expect(
      findings.some(
        (f) => f.message.includes('KB-finance-settlement-0001') && f.message.toLowerCase().includes('opaque'),
      ),
    ).toBe(true);
  });

  it('accepts a plain KB-NNNN with no name embedded, of any digit width ≥ 3', () => {
    expect(corpusRegistryFindings([registryRow({ id: 'KB-42000' })])).toEqual([]);
  });

  it('flags two registry rows sharing one KB-NNNN (the cross-pack collision this amendment fixes)', () => {
    const rowA = registryRow({ path: 'knowledge/pack-a/references/001-a.md' });
    const rowB = registryRow({
      plugin: 'other-pack',
      path: 'knowledge/pack-b/references/001-b.md',
    });
    const findings = corpusRegistryFindings([rowA, rowB]);
    expect(findings.some((f) => f.message.includes('KB-0001') && f.message.toLowerCase().includes('duplicate'))).toBe(
      true,
    );
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

  /**
   * 061 Phase 8 T-1004 (Risk-1 mitigation): the same (plugin, slug) registered
   * under two marketplaces is an identity fragmentation — warn, never block.
   */
  it('warns when the same (plugin, slug) is registered under two marketplaces (identity fragmentation)', () => {
    const rowA = registryRow({ id: 'KB-0001', marketplace: 'local' });
    const rowB = registryRow({ id: 'KB-0002', marketplace: 'my-repo' }); // same plugin+slug, different marketplace
    const findings = corpusRegistryFindings([rowA, rowB]);
    const frag = findings.filter((f) => f.message.toLowerCase().includes('fragmentation'));
    expect(frag).toHaveLength(1);
    expect(frag[0]?.severity).toBe('warning');
    expect(frag[0]?.message).toContain('finance-settlement/001-settlement-windows');
  });

  it('does not warn when the same (plugin, slug) is under a single marketplace', () => {
    const findings = corpusRegistryFindings([registryRow()]);
    expect(findings.filter((f) => f.message.toLowerCase().includes('fragmentation'))).toEqual([]);
  });
});
