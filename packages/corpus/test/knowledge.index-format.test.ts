/**
 * T-1001 (spec 051, 2026-07-26-two-layer-corpus-identity amendment) — the
 * root-registry (FR-009) and SKILL.md-inlined slug-map (FR-004 MODIFY)
 * parse/render, added alongside the existing parseIndex/renderIndexTable
 * (unchanged, still covers the pre-migration per-pack index.md format).
 */
import { describe, expect, it } from 'vitest';
import {
  parseIndex,
  renderIndexTable,
  parseRegistry,
  renderRegistryTable,
  parseSkillSlugMap,
  renderSkillSlugMapTable,
} from '../src/knowledge/index-format.js';

describe('parseIndex / renderIndexTable (pre-migration, unchanged by this amendment)', () => {
  it('round-trips a 5-column pack index', () => {
    const table = renderIndexTable([
      { id: 'KB-002', title: 'Second', description: 'd2', edition: '2026-01-02', path: 'references/KB-002.md' },
      { id: 'KB-001', title: 'First', description: 'd1', edition: '2026-01-01', path: 'references/KB-001.md' },
    ]);
    const parsed = parseIndex(table);
    expect(parsed).toEqual([
      { id: 'KB-001', title: 'First', description: 'd1', edition: '2026-01-01', path: 'references/KB-001.md' },
      { id: 'KB-002', title: 'Second', description: 'd2', edition: '2026-01-02', path: 'references/KB-002.md' },
    ]);
  });
});

describe('parseRegistry / renderRegistryTable (FR-009, the root registry)', () => {
  it('round-trips a registry with no status set, sorted by KB-NNNN', () => {
    const table = renderRegistryTable([
      {
        id: 'KB-0007',
        marketplace: 'spectastic-examples',
        plugin: 'finance-settlement',
        slug: '001-settlement-windows',
        title: 'Settlement windows',
        edition: '2026-07-25',
        path: 'knowledge/finance-settlement/references/001-settlement-windows.md',
      },
      {
        id: 'KB-0001',
        marketplace: 'spectastic',
        plugin: 'spectastic-concepts',
        slug: '001-foundations',
        title: 'Foundations',
        edition: '2026-07-25',
        path: 'knowledge/spectastic-concepts/references/001-foundations.md',
      },
    ]);
    const parsed = parseRegistry(table);
    expect(parsed.map((r) => r.id)).toEqual(['KB-0001', 'KB-0007']); // sorted
    expect(parsed[0]).toEqual({
      id: 'KB-0001',
      marketplace: 'spectastic',
      plugin: 'spectastic-concepts',
      slug: '001-foundations',
      title: 'Foundations',
      edition: '2026-07-25',
      path: 'knowledge/spectastic-concepts/references/001-foundations.md',
      status: '',
    });
  });

  it('accepts a 4-digit KB-NNNN and silently skips a malformed row (never invents one)', () => {
    const table = [
      '| KB-NNNN | Marketplace | Plugin | Slug | Title | Edition | Path |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| KB-0042 | m | p | s | t | e | pa |',
      '| not-a-kb-id | m | p | s | t | e | pa |', // malformed id, skipped
      '| KB-0043 | only | five | cols | oops |', // wrong column count, skipped
    ].join('\n');
    const parsed = parseRegistry(table);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe('KB-0042');
  });

  /**
   * 2026-07-26 061-corpus-ingester T-010: the widened 8-column registry
   * shape (plan D-005, FR-007) — an orphan-flagging `status` column beside
   * the existing 7. A pre-existing 7-column row (pre-061) still parses
   * unchanged — the widening is additive, never a breaking re-shape.
   */
  it('round-trips an 8th status column', () => {
    const table = renderRegistryTable([
      {
        id: 'KB-0003',
        marketplace: 'spectastic-examples',
        plugin: 'finance-settlement',
        slug: '002-clearing-cutover',
        title: 'Clearing cutover',
        edition: '2026-07-25',
        path: 'knowledge/finance-settlement/references/002-clearing-cutover.md',
        status: 'orphaned',
      },
    ]);
    expect(table).toContain('Status');
    const parsed = parseRegistry(table);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.status).toBe('orphaned');
  });

  it('renders a blank status cell for a current (non-orphaned) row, and parses it back as blank', () => {
    const table = renderRegistryTable([
      {
        id: 'KB-0001',
        marketplace: 'spectastic',
        plugin: 'spectastic-concepts',
        slug: '001-foundations',
        title: 'Foundations',
        edition: '2026-07-25',
        path: 'knowledge/spectastic-concepts/references/001-foundations.md',
      },
    ]);
    const parsed = parseRegistry(table);
    expect(parsed[0]?.status).toBe('');
  });

  it('still parses a pre-existing 7-column row with no status column at all (back-compat)', () => {
    const legacyTable = [
      '| KB-NNNN | Marketplace | Plugin | Slug | Title | Edition | Path |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| KB-0042 | m | p | s | t | e | pa |',
    ].join('\n');
    const parsed = parseRegistry(legacyTable);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe('KB-0042');
    expect(parsed[0]?.status).toBe('');
  });
});

describe('parseSkillSlugMap / renderSkillSlugMapTable (FR-004 MODIFY, the SKILL.md-inlined map)', () => {
  it('round-trips a 5-column slug map, sorted by slug', () => {
    const table = renderSkillSlugMapTable([
      { slug: '002-clearing-cutover', title: 'Clearing cutover', description: 'd2', edition: '2026-07-25', path: 'references/002-clearing-cutover.md' },
      { slug: '001-settlement-windows', title: 'Settlement windows', description: 'd1', edition: '2026-07-25', path: 'references/001-settlement-windows.md' },
    ]);
    const parsed = parseSkillSlugMap(table);
    expect(parsed.map((r) => r.slug)).toEqual(['001-settlement-windows', '002-clearing-cutover']); // sorted
  });

  it('finds the map table embedded inside SKILL.md frontmatter + prose, ignoring surrounding content', () => {
    const skillMd = [
      '---',
      'name: finance-settlement',
      'description: Securities-settlement domain knowledge.',
      '---',
      '',
      '# finance-settlement',
      '',
      'Domain knowledge for securities settlement. Read the map below, then pull a document from',
      '`references/` as the work calls for it.',
      '',
      '| Slug | Title | Description | Edition | Path |',
      '| --- | --- | --- | --- | --- |',
      '| 001-settlement-windows | Settlement windows | T+1/T+2 cycles. | 2026-07-25 | references/001-settlement-windows.md |',
    ].join('\n');
    const parsed = parseSkillSlugMap(skillMd);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ slug: '001-settlement-windows', title: 'Settlement windows' });
  });

  it('never mistakes a KB- id for a slug (a pack never mints one, FR-002)', () => {
    const table = [
      '| Slug | Title | Description | Edition | Path |',
      '| --- | --- | --- | --- | --- |',
      '| KB-001 | Old-model row | should not parse as a slug | 2026-01-01 | x.md |',
    ].join('\n');
    expect(parseSkillSlugMap(table)).toEqual([]);
  });
});
