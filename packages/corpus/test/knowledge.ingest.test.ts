import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseRegistry, parseSkillSlugMap } from '../src/knowledge/index-format.js';
import { allocateRegistryIds, installPack, mergeRegistryRows, registerDocument } from '../src/knowledge/ingest.js';
import type { RegistryEntry } from '../src/knowledge/types.js';
import type { PackFetcher } from '../src/providers/pack-fetcher.js';

/**
 * 2026-07-26 061-corpus-ingester T-013 (Foundational, red-first): the
 * repo-wide backbone — allocateRegistryIds (FR-001/FR-003, plan D-004) and
 * mergeRegistryRows (FR-002, plan D-004). Both are pure functions over the
 * loaded registry; no wall-clock reads (NFR-001).
 */

function entry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
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

describe('allocateRegistryIds (T-013, FR-001/FR-003)', () => {
  it('allocates starting at KB-0001 for an empty registry', () => {
    expect(allocateRegistryIds([], 2)).toEqual(['KB-0001', 'KB-0002']);
  });

  it('continues monotonically from the real registry max, not a per-pack one', () => {
    const registry = [entry({ id: 'KB-0001' }), entry({ id: 'KB-0007', slug: '002-clearing-cutover' })];
    expect(allocateRegistryIds(registry, 2)).toEqual(['KB-0008', 'KB-0009']);
  });

  it('never reuses a retired id — an orphaned row still counts toward the max', () => {
    const registry = [entry({ id: 'KB-0005', status: 'orphaned' })];
    expect(allocateRegistryIds(registry, 1)).toEqual(['KB-0006']);
  });

  it('is deterministic — the same registry produces byte-identical allocations on repeat calls (NFR-001)', () => {
    const registry = [entry({ id: 'KB-0003' })];
    expect(allocateRegistryIds(registry, 3)).toEqual(allocateRegistryIds(registry, 3));
  });
});

describe('mergeRegistryRows (T-013, FR-002/FR-004, plan D-004)', () => {
  it('adds a genuinely new row keyed on (marketplace, plugin, slug)', () => {
    const existing: RegistryEntry[] = [];
    const fresh = [entry()];
    const merged = mergeRegistryRows(existing, fresh);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(fresh[0]);
  });

  it('a hand-edited cell on an existing row survives a re-run untouched (non-destructive)', () => {
    const existing = [entry({ title: 'Hand-corrected title' })];
    const fresh = [entry({ title: 'Freshly re-derived title', edition: '2026-08-01' })];
    const merged = mergeRegistryRows(existing, fresh);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.title).toBe('Hand-corrected title');
  });

  it('a blank existing cell is filled by the fresh value', () => {
    const existing = [entry({ title: '' })];
    const fresh = [entry({ title: 'Settlement windows' })];
    const merged = mergeRegistryRows(existing, fresh);
    expect(merged[0]?.title).toBe('Settlement windows');
  });

  it('is deterministic — the same inputs produce byte-identical output on repeat calls (NFR-001)', () => {
    const existing = [entry({ title: 'Hand-corrected' })];
    const fresh = [entry({ title: 'Fresh' })];
    expect(mergeRegistryRows(existing, fresh)).toEqual(mergeRegistryRows(existing, fresh));
  });
});

/**
 * 2026-07-26 061-corpus-ingester T-101/T-102 (US1, red-first): installPack —
 * fetch via the seam, convert every reference, assign a KB-NNNN each, write
 * the root-registry rows and the pack's SKILL.md slug map (FR-004/FR-008),
 * without fabricating any provenance field (FR-009).
 */
describe('installPack (T-101/T-102, FR-001/FR-002/FR-004/FR-008/FR-009)', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  /** A fetched source pack: a references/ folder of slug-named .md files. */
  function sourcePack(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'spectastic-ingest-src-'));
    mkdirSync(join(dir, 'references'), { recursive: true });
    for (const [name, body] of Object.entries(files)) {
      writeFileSync(join(dir, 'references', name), body, 'utf8');
    }
    dirs.push(dir);
    return dir;
  }

  /** A temp project's knowledge/ destination. */
  function knowledgeDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'spectastic-ingest-dest-'));
    dirs.push(join(dir)); // the parent is cleaned; knowledgeDir itself is a subpath
    const kd = join(dir, 'knowledge');
    mkdirSync(kd, { recursive: true });
    return kd;
  }

  function stubFetcher(coordinate: string, path: string): PackFetcher {
    return {
      fetch: async (c: string) =>
        c === coordinate
          ? path
          : (() => {
              throw new Error('unexpected coordinate');
            })(),
    };
  }

  it('converts every reference, assigns a repo-unique KB-NNNN each, and writes the root-registry rows', async () => {
    const src = sourcePack({
      '001-settlement-windows.md': '# Settlement windows\n\nT+1/T+2 cycles.\n',
      '002-clearing-cutover.md': '# Clearing cutover\n\nCutover rules.\n',
    });
    const kd = knowledgeDir();
    const coordinate = 'finance-settlement@spectastic-examples';

    const result = await installPack({
      fetcher: stubFetcher(coordinate, src),
      coordinate,
      knowledgeDir: kd,
    });

    expect(result.plugin).toBe('finance-settlement');
    expect(result.marketplace).toBe('spectastic-examples');
    expect(result.written).toHaveLength(2);
    expect(result.skipped).toEqual([]);

    const registry = parseRegistry(readFileSync(join(kd, 'index.md'), 'utf8'));
    expect(registry).toHaveLength(2);
    expect(registry.map((r) => r.slug).sort()).toEqual(['001-settlement-windows', '002-clearing-cutover']);
    expect(registry.every((r) => r.marketplace === 'spectastic-examples' && r.plugin === 'finance-settlement')).toBe(
      true,
    );
    expect(new Set(registry.map((r) => r.id)).size).toBe(2); // repo-unique
  });

  it('writes the pack SKILL.md slug map alongside the registry', async () => {
    const src = sourcePack({
      '001-settlement-windows.md': '# Settlement windows\n\nBody.\n',
    });
    const kd = knowledgeDir();
    const coordinate = 'finance-settlement@spectastic-examples';

    await installPack({
      fetcher: stubFetcher(coordinate, src),
      coordinate,
      knowledgeDir: kd,
    });

    const skillMd = readFileSync(join(kd, 'finance-settlement', 'SKILL.md'), 'utf8');
    const rows = parseSkillSlugMap(skillMd);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.slug).toBe('001-settlement-windows');
  });

  it('never fabricates provenance — a genuinely-read field is verbatim, everything else TODO, content hash always computed', async () => {
    const src = sourcePack({
      '001-settlement-windows.md':
        '---\norigin: SEC release\nlicense: CC-BY-4.0\n---\n\n# Settlement windows\n\nBody.\n',
    });
    const kd = knowledgeDir();
    const coordinate = 'finance-settlement@spectastic-examples';

    await installPack({
      fetcher: stubFetcher(coordinate, src),
      coordinate,
      knowledgeDir: kd,
    });

    const written = readFileSync(join(kd, 'finance-settlement', 'references', '001-settlement-windows.md'), 'utf8');
    expect(written).toContain('origin: SEC release'); // genuinely read, verbatim
    expect(written).toContain('license: CC-BY-4.0'); // genuinely read, verbatim
    expect(written).toContain('content-hash: sha256:'); // always computed
    expect(written).toMatch(/origin-url: TODO/); // never read, never fabricated
    expect(written).toMatch(/edition: TODO/);
    expect(written).toMatch(/converter: TODO/);
  });

  it("sets the install door's not-yet-spot-checked status, overriding whatever the source itself declared", async () => {
    const src = sourcePack({
      '001-settlement-windows.md': '---\nstatus: illustrative-excerpt\n---\n\n# Settlement windows\n\nBody.\n',
    });
    const kd = knowledgeDir();
    const coordinate = 'finance-settlement@spectastic-examples';

    await installPack({
      fetcher: stubFetcher(coordinate, src),
      coordinate,
      knowledgeDir: kd,
    });

    const written = readFileSync(join(kd, 'finance-settlement', 'references', '001-settlement-windows.md'), 'utf8');
    expect(written).toContain('status: not-yet-spot-checked');
    expect(written).not.toContain('illustrative-excerpt');
  });

  it('supersede-by-append — a re-import at a newer edition keeps the KB-NNNN, bumps the registry edition, and retains the prior doc under superseded/', async () => {
    const kd = knowledgeDir();
    const coordinate = 'finance-settlement@spectastic-examples';

    const srcV1 = sourcePack({
      '001-settlement-windows.md': '---\nedition: 2026-01-01\n---\n\n# Settlement windows\n\nOriginal text.\n',
    });
    const first = await installPack({
      fetcher: stubFetcher(coordinate, srcV1),
      coordinate,
      knowledgeDir: kd,
    });
    expect(first.written).toHaveLength(1);
    const id = first.written[0]!;

    const srcV2 = sourcePack({
      '001-settlement-windows.md': '---\nedition: 2026-07-01\n---\n\n# Settlement windows\n\nUpdated text.\n',
    });
    const second = await installPack({
      fetcher: stubFetcher(coordinate, srcV2),
      coordinate,
      knowledgeDir: kd,
    });

    expect(second.written).toEqual([]); // same anchor, not a "new" registration
    expect(second.superseded).toEqual([id]); // but reported as a supersede

    const registry = parseRegistry(readFileSync(join(kd, 'index.md'), 'utf8'));
    expect(registry).toHaveLength(1);
    expect(registry[0]?.id).toBe(id); // KB-NNNN never moves
    expect(registry[0]?.edition).toBe('2026-07-01'); // bumped

    const priorPath = join(
      kd,
      'finance-settlement',
      'references',
      'superseded',
      '001-settlement-windows@2026-01-01.md',
    );
    expect(readFileSync(priorPath, 'utf8')).toContain('Original text.');

    const currentPath = join(kd, 'finance-settlement', 'references', '001-settlement-windows.md');
    expect(readFileSync(currentPath, 'utf8')).toContain('Updated text.');
  });

  it('orphan-flagging — a reference dropped from a re-import is marked status=orphaned, never deleted', async () => {
    const kd = knowledgeDir();
    const coordinate = 'finance-settlement@spectastic-examples';

    const srcV1 = sourcePack({
      '001-settlement-windows.md': '# Settlement windows\n\nBody.\n',
      '002-clearing-cutover.md': '# Clearing cutover\n\nBody.\n',
    });
    await installPack({
      fetcher: stubFetcher(coordinate, srcV1),
      coordinate,
      knowledgeDir: kd,
    });

    // Re-import drops 002-clearing-cutover entirely.
    const srcV2 = sourcePack({
      '001-settlement-windows.md': '# Settlement windows\n\nBody.\n',
    });
    const second = await installPack({
      fetcher: stubFetcher(coordinate, srcV2),
      coordinate,
      knowledgeDir: kd,
    });

    expect(second.orphaned).toHaveLength(1);
    const registry = parseRegistry(readFileSync(join(kd, 'index.md'), 'utf8'));
    expect(registry).toHaveLength(2); // never deleted
    const orphanedRow = registry.find((r) => r.slug === '002-clearing-cutover');
    expect(orphanedRow?.status).toBe('orphaned');
    const currentRow = registry.find((r) => r.slug === '001-settlement-windows');
    expect(currentRow?.status).toBe('');
  });

  it('plugin-rename migration — a renamed plugin resolves to the same KB-NNNN via the marketplace renames map', async () => {
    const kd = knowledgeDir();

    const srcV1 = sourcePack({
      '001-settlement-windows.md': '# Settlement windows\n\nBody.\n',
    });
    const first = await installPack({
      fetcher: stubFetcher('finance-old-name@spectastic-examples', srcV1),
      coordinate: 'finance-old-name@spectastic-examples',
      knowledgeDir: kd,
    });
    expect(first.written).toHaveLength(1);
    const id = first.written[0]!;

    // Re-import under the renamed plugin, with the marketplace's own renames map supplied.
    const srcV2 = sourcePack({
      '001-settlement-windows.md': '# Settlement windows\n\nBody.\n',
    });
    const second = await installPack({
      fetcher: stubFetcher('finance-settlement@spectastic-examples', srcV2),
      coordinate: 'finance-settlement@spectastic-examples',
      knowledgeDir: kd,
      renames: { 'finance-old-name': 'finance-settlement' },
    });

    expect(second.written).toEqual([]); // resolved to the existing anchor, not a fresh registration
    const registry = parseRegistry(readFileSync(join(kd, 'index.md'), 'utf8'));
    expect(registry).toHaveLength(1); // no duplicate row
    expect(registry[0]?.id).toBe(id); // same KB-NNNN survives the rename
    expect(registry[0]?.plugin).toBe('finance-settlement'); // migrated to the current name
  });

  it('is idempotent — re-running with no new references writes nothing new and never rewrites a hand-corrected field back to TODO (NFR-003)', async () => {
    const src = sourcePack({
      '001-settlement-windows.md': '# Settlement windows\n\nBody.\n',
    });
    const kd = knowledgeDir();
    const coordinate = 'finance-settlement@spectastic-examples';

    const first = await installPack({
      fetcher: stubFetcher(coordinate, src),
      coordinate,
      knowledgeDir: kd,
    });
    expect(first.written).toHaveLength(1);

    // Hand-correct the registry row's title, matching the sole-writer discipline's
    // reader side: a human edits the registry directly between runs.
    const registryPath = join(kd, 'index.md');
    const handCorrected = readFileSync(registryPath, 'utf8').replace('Settlement windows', 'Hand-corrected title');
    writeFileSync(registryPath, handCorrected, 'utf8');

    const second = await installPack({
      fetcher: stubFetcher(coordinate, src),
      coordinate,
      knowledgeDir: kd,
    });
    expect(second.written).toEqual([]); // nothing new
    expect(second.skipped).toEqual(first.written); // the same reference, now skipped

    const registry = parseRegistry(readFileSync(registryPath, 'utf8'));
    expect(registry[0]?.title).toBe('Hand-corrected title'); // survives untouched
  });

  it('063-corpus-discoverability T-212: syncs marketplace.json when corpusMarketplaceName is given, stays a no-op otherwise (FR-003)', async () => {
    const src = sourcePack({
      '001-settlement-windows.md': '# Settlement windows\n\nBody.\n',
    });
    const kd = knowledgeDir();
    const coordinate = 'finance-settlement@spectastic-examples';

    await installPack({
      fetcher: stubFetcher(coordinate, src),
      coordinate,
      knowledgeDir: kd,
    });
    expect(existsSync(join(kd, 'marketplace.json')), 'no sync without corpusMarketplaceName').toBe(false);

    const withSync = knowledgeDir();
    await installPack({
      fetcher: stubFetcher(coordinate, src),
      coordinate,
      knowledgeDir: withSync,
      corpusMarketplaceName: 'acme',
    });
    const manifest = JSON.parse(readFileSync(join(withSync, 'marketplace.json'), 'utf8')) as {
      name: string;
      plugins: unknown[];
    };
    expect(manifest.name).toBe('acme');
    expect(manifest.plugins).toHaveLength(1);
  });

  it('061 Phase 8 T-1001: a marketplace-less coordinate files under corpusMarketplaceName (else the local sentinel)', async () => {
    const src = sourcePack({ '001-fact.md': '# A fact\n\nBody.\n' });
    const kd = knowledgeDir();
    // No @marketplace in the coordinate — a local, in-repo pack.
    const r = await installPack({
      fetcher: stubFetcher('ops-knowledge', src),
      coordinate: 'ops-knowledge',
      knowledgeDir: kd,
      corpusMarketplaceName: 'my-repo',
    });
    expect(r.marketplace).toBe('my-repo');
    const registry = parseRegistry(readFileSync(join(kd, 'index.md'), 'utf8'));
    expect(registry[0]?.marketplace).toBe('my-repo');
    expect(registry[0]?.plugin).toBe('ops-knowledge');

    const kd2 = knowledgeDir();
    const bare = await installPack({
      fetcher: stubFetcher('ops-knowledge', src),
      coordinate: 'ops-knowledge',
      knowledgeDir: kd2,
    });
    expect(bare.marketplace, 'no config → the local sentinel').toBe('local');
  });

  it("061 Phase 8 T-1002: a marketplace-less re-import reuses the existing row's marketplace (pin, no re-key on config drift)", async () => {
    const src = sourcePack({ '001-fact.md': '# A fact\n\nBody.\n' });
    const kd = knowledgeDir();
    // First import files it under 'first-name'.
    await installPack({
      fetcher: stubFetcher('ops-knowledge', src),
      coordinate: 'ops-knowledge',
      knowledgeDir: kd,
      corpusMarketplaceName: 'first-name',
    });
    // Config drifts: a re-import with a DIFFERENT corpus.marketplace...
    const second = await installPack({
      fetcher: stubFetcher('ops-knowledge', src),
      coordinate: 'ops-knowledge',
      knowledgeDir: kd,
      corpusMarketplaceName: 'drifted-name',
    });
    // ...still resolves to the existing row's marketplace — no second KB-NNNN under 'drifted-name'.
    expect(second.marketplace).toBe('first-name');
    const registry = parseRegistry(readFileSync(join(kd, 'index.md'), 'utf8'));
    expect(registry).toHaveLength(1);
    expect(registry[0]?.marketplace).toBe('first-name');
  });

  it("061 Phase 8 T-1005: a source pack's existing references/superseded/ editions are preserved on import (FR-013)", async () => {
    const src = sourcePack({ '001-settlement.md': '# Settlement\n\nT+1.\n' });
    // The source already retains a prior edition.
    mkdirSync(join(src, 'references', 'superseded'), { recursive: true });
    writeFileSync(
      join(src, 'references', 'superseded', '001-settlement@2017-09-05.md'),
      '---\nslug: 001-settlement\nedition: 2017-09-05\n---\n\n# Settlement (T+2)\n\nPrior edition.\n',
      'utf8',
    );
    const kd = knowledgeDir();
    await installPack({
      fetcher: stubFetcher('finance@acme', src),
      coordinate: 'finance@acme',
      knowledgeDir: kd,
    });

    expect(
      existsSync(join(kd, 'finance', 'references', 'superseded', '001-settlement@2017-09-05.md')),
      'the retained prior edition must be copied into the installed pack',
    ).toBe(true);
  });
});

describe('registerDocument (T-212, FR-003)', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function knowledgeDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'spectastic-register-dest-'));
    dirs.push(dir);
    const kd = join(dir, 'knowledge');
    mkdirSync(kd, { recursive: true });
    return kd;
  }

  it('syncs marketplace.json when corpusMarketplaceName is given, stays a no-op otherwise', () => {
    const kd = knowledgeDir();
    registerDocument({
      knowledgeDir: kd,
      marketplace: 'in-house',
      plugin: 'ops-knowledge',
      slug: '001-fact',
      title: 'A fact',
      body: 'Body text.',
      origin: 'interview: ops-lead, 2026-07-27',
      status: 'not-citable-until-signed-off',
    });
    expect(existsSync(join(kd, 'marketplace.json')), 'no sync without corpusMarketplaceName').toBe(false);

    const withSync = knowledgeDir();
    registerDocument({
      knowledgeDir: withSync,
      marketplace: 'in-house',
      plugin: 'ops-knowledge',
      slug: '001-fact',
      title: 'A fact',
      body: 'Body text.',
      origin: 'interview: ops-lead, 2026-07-27',
      status: 'not-citable-until-signed-off',
      corpusMarketplaceName: 'acme',
    });
    const manifest = JSON.parse(readFileSync(join(withSync, 'marketplace.json'), 'utf8')) as {
      name: string;
      plugins: unknown[];
    };
    expect(manifest.name).toBe('acme');
    expect(manifest.plugins).toHaveLength(1);
  });
});
