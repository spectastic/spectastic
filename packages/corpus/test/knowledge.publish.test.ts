import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderRegistryTable } from '../src/knowledge/index-format.js';
import { publishCorpus, renderMarketplaceManifest, syncMarketplaceManifest } from '../src/knowledge/publish.js';
import type { RegistryEntry } from '../src/knowledge/types.js';

/**
 * 063-corpus-discoverability T-200/T-201: renderMarketplaceManifest derives
 * plugins[] from the registry + each pack's SKILL.md (FR-002, never
 * fabricating a description — NFR-002); syncMarketplaceManifest merges that
 * non-destructively over an existing manifest and is idempotent (FR-003,
 * NFR-001).
 */

function corpusDir(tag: string): string {
  return mkdtempSync(join(tmpdir(), `spectastic-corpus-publish-${tag}-`));
}

function row(over: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: 'KB-0001',
    marketplace: 'spectastic-examples',
    plugin: 'finance-settlement',
    slug: '001-settlement-windows',
    title: 'Settlement windows',
    edition: '2026-01-01',
    path: 'finance-settlement/references/001-settlement-windows.md',
    status: '',
    ...over,
  };
}

function writeRegistry(dir: string, rows: RegistryEntry[]): void {
  writeFileSync(join(dir, 'index.md'), renderRegistryTable(rows), 'utf8');
}

function writeSkill(dir: string, plugin: string, description: string): void {
  const packDir = join(dir, plugin);
  mkdirSync(packDir, { recursive: true });
  writeFileSync(join(packDir, 'SKILL.md'), `---\nname: ${plugin}\ndescription: ${description}\n---\n`, 'utf8');
}

describe('renderMarketplaceManifest (T-200, FR-002, NFR-002)', () => {
  it('derives one plugins[] entry per distinct pack, description from its own SKILL.md', () => {
    const dir = corpusDir('render');
    writeRegistry(dir, [row()]);
    writeSkill(dir, 'finance-settlement', 'Securities-settlement domain knowledge for grounding cash specs.');

    const manifest = renderMarketplaceManifest({
      marketplaceName: 'acme',
      knowledgeDir: dir,
    });
    expect(manifest.name).toBe('acme');
    expect(manifest.owner).toEqual({ name: 'acme' });
    expect(manifest.plugins).toEqual([
      {
        name: 'finance-settlement',
        source: './finance-settlement',
        description: 'Securities-settlement domain knowledge for grounding cash specs.',
      },
    ]);
    rmSync(dir, { recursive: true, force: true });
  });

  it('groups multiple registry rows for the same plugin into one entry', () => {
    const dir = corpusDir('group');
    writeRegistry(dir, [row(), row({ id: 'KB-0002', slug: '002-fx-risk' })]);
    writeSkill(dir, 'finance-settlement', 'Securities-settlement domain knowledge for grounding cash specs.');

    const manifest = renderMarketplaceManifest({
      marketplaceName: 'acme',
      knowledgeDir: dir,
    });
    expect(manifest.plugins).toHaveLength(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it('never fabricates a description — falls back to a plain template when SKILL.md has none real', () => {
    const dir = corpusDir('nodesc');
    writeRegistry(dir, [row()]);
    // No SKILL.md at all.
    const manifest = renderMarketplaceManifest({
      marketplaceName: 'acme',
      knowledgeDir: dir,
    });
    expect(manifest.plugins[0]?.description).toBe('Domain knowledge for finance-settlement.');
    rmSync(dir, { recursive: true, force: true });
  });

  it('an empty registry renders an empty plugins[], never an error', () => {
    const dir = corpusDir('empty');
    const manifest = renderMarketplaceManifest({
      marketplaceName: 'acme',
      knowledgeDir: dir,
    });
    expect(manifest.plugins).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('syncMarketplaceManifest (T-201, FR-003, NFR-001)', () => {
  it('writes a fresh manifest when none exists', () => {
    const dir = corpusDir('fresh');
    writeRegistry(dir, [row()]);
    syncMarketplaceManifest({ marketplaceName: 'acme', knowledgeDir: dir });
    expect(existsSync(join(dir, 'marketplace.json'))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it('preserves a hand-edited top-level owner on re-sync (manifest-only curation, no other source)', () => {
    const dir = corpusDir('handedit-owner');
    writeRegistry(dir, [row()]);
    writeFileSync(
      join(dir, 'marketplace.json'),
      JSON.stringify(
        {
          name: 'acme',
          owner: { name: 'Hand-Edited Owner' },
          plugins: [
            {
              name: 'finance-settlement',
              source: './finance-settlement',
              description: 'Stale blurb.',
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    );

    const merged = syncMarketplaceManifest({
      marketplaceName: 'acme',
      knowledgeDir: dir,
    });
    expect(merged.owner).toEqual({ name: 'Hand-Edited Owner' });
    rmSync(dir, { recursive: true, force: true });
  });

  it("a plugin description ALWAYS reflects the pack's current SKILL.md, never a frozen stale copy", () => {
    // Regression for a real bug found dogfooding T-312: the old "existing
    // wins" policy re-shipped a generic auto-generated description forever,
    // even after the pack's own SKILL.md was corrected to something real.
    const dir = corpusDir('always-fresh-description');
    writeRegistry(dir, [row()]);
    writeFileSync(
      join(dir, 'marketplace.json'),
      JSON.stringify(
        {
          name: 'acme',
          owner: { name: 'acme' },
          plugins: [
            {
              name: 'finance-settlement',
              source: './finance-settlement',
              description: 'An old, now-wrong description.',
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    );
    writeSkill(dir, 'finance-settlement', 'The corrected, accurate description now in SKILL.md.');

    const merged = syncMarketplaceManifest({
      marketplaceName: 'acme',
      knowledgeDir: dir,
    });
    expect(merged.plugins[0]?.description).toBe('The corrected, accurate description now in SKILL.md.');
    rmSync(dir, { recursive: true, force: true });
  });

  it('re-running against an already-in-sync manifest produces byte-identical output (idempotent)', () => {
    const dir = corpusDir('idempotent');
    writeRegistry(dir, [row()]);
    writeSkill(dir, 'finance-settlement', 'Securities-settlement domain knowledge for grounding cash specs.');
    syncMarketplaceManifest({ marketplaceName: 'acme', knowledgeDir: dir });
    const first = readFileSync(join(dir, 'marketplace.json'), 'utf8');
    syncMarketplaceManifest({ marketplaceName: 'acme', knowledgeDir: dir });
    const second = readFileSync(join(dir, 'marketplace.json'), 'utf8');
    expect(second).toBe(first);
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps a plugin the existing manifest lists but the registry no longer has (never silently drops)', () => {
    const dir = corpusDir('keep-orphan');
    writeRegistry(dir, [row()]); // only finance-settlement in the registry now
    writeFileSync(
      join(dir, 'marketplace.json'),
      JSON.stringify(
        {
          name: 'acme',
          owner: { name: 'acme' },
          plugins: [
            {
              name: 'finance-settlement',
              source: './finance-settlement',
              description: 'x',
            },
            {
              name: 'retired-pack',
              source: './retired-pack',
              description: 'y',
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    );

    const merged = syncMarketplaceManifest({
      marketplaceName: 'acme',
      knowledgeDir: dir,
    });
    expect(merged.plugins.map((p) => p.name)).toContain('retired-pack');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('publishCorpus (T-202/T-213 primitive, FR-004)', () => {
  it('generates a missing manifest and reports it did not already exist', () => {
    const dir = corpusDir('publish-fresh');
    writeRegistry(dir, [row()]);
    const result = publishCorpus({
      marketplaceName: 'acme',
      knowledgeDir: dir,
    });
    expect(result.alreadyExisted).toBe(false);
    expect(existsSync(result.manifestPath)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it('is idempotent — a second publish reports the manifest already existed and changes nothing', () => {
    const dir = corpusDir('publish-idempotent');
    writeRegistry(dir, [row()]);
    publishCorpus({ marketplaceName: 'acme', knowledgeDir: dir });
    const before = readFileSync(join(dir, 'marketplace.json'), 'utf8');
    const second = publishCorpus({
      marketplaceName: 'acme',
      knowledgeDir: dir,
    });
    expect(second.alreadyExisted).toBe(true);
    expect(readFileSync(join(dir, 'marketplace.json'), 'utf8')).toBe(before);
    rmSync(dir, { recursive: true, force: true });
  });
});
