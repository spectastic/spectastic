import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadCorpus, loadRegistry } from '../src/knowledge/index.js';
import { migratePack } from '../src/knowledge/migrate.js';
import { KB_ID_RE } from '../src/knowledge/types.js';
import { corpusWellFormedFindings } from '../src/knowledge/validate.js';
import { tempProjectRoot, writeSingleLayerPack, writeTwoLayerDoc } from './fixtures/single-layer-pack.js';

/**
 * 066-corpus-single-layer-retire: red-first tests for migratePack (plan
 * D-002/D-003) — converting an existing single-layer pack (`id:` documents +
 * a pack-local `index.md`) to two-layer in place.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function root(): string {
  const dir = tempProjectRoot();
  dirs.push(dir);
  return dir;
}

describe('migratePack — converts a single-layer pack in place (066, T-200)', () => {
  it('every document gains slug:, one registry row lands per document, a SKILL.md exists, and the pack index is removed', () => {
    const cwd = root();
    writeSingleLayerPack(cwd, 'example', {
      // Realistic single-layer filenames: the pre-062 adaptFolder wrote each
      // document under its ORIGINAL source filename, never a KB-/NNN-prefixed
      // one — the id lived only in frontmatter.
      'alpha.md': {
        id: 'KB-001',
        body: 'Alpha body.',
        title: 'Alpha',
        description: 'The alpha doc.',
      },
      'beta.md': {
        id: 'KB-002',
        body: 'Beta body.',
        title: 'Beta',
        description: 'The beta doc.',
      },
    });
    const knowledgeDir = join(cwd, 'knowledge');
    expect(existsSync(join(knowledgeDir, 'example', 'index.md'))).toBe(true);

    const result = migratePack({
      knowledgeDir,
      pack: 'example',
      marketplace: 'test-mp',
    });

    expect(result.migrated).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);

    const packs = loadCorpus(cwd);
    const pack = packs.find((p) => p.name === 'example')!;
    expect(pack.documents).toHaveLength(2);
    expect(pack.documents.every((d) => d.id === null && !!d.slug)).toBe(true);
    expect(pack.index).toHaveLength(0);
    expect(existsSync(join(knowledgeDir, 'example', 'index.md'))).toBe(false);
    expect(existsSync(join(knowledgeDir, 'example', 'SKILL.md'))).toBe(true);
    expect(pack.hasSkillFile).toBe(true);

    const registry = loadRegistry(cwd);
    expect(registry).toHaveLength(2);
    expect(registry.every((r) => KB_ID_RE.test(r.id))).toBe(true);

    // Hand-authored title/description (from the pack's own index) survives.
    const titles = registry.map((r) => r.title).sort();
    expect(titles).toEqual(['Alpha', 'Beta']);

    expect(corpusWellFormedFindings(packs)).toEqual([]);
  });
});

describe('migratePack — allocates a fresh repo-unique id (066, T-201)', () => {
  it('never reuses the pack-local id: number; the slug stays stable, the registry id is freshly allocated', () => {
    const cwd = root();
    const knowledgeDir = join(cwd, 'knowledge');
    // Seed the root registry with an unrelated pack already at KB-0005, so a
    // naive re-use of the pack-local "KB-001" would both collide AND be
    // repo-non-unique.
    mkdirSync(knowledgeDir, { recursive: true });
    writeFileSync(
      join(knowledgeDir, 'index.md'),
      '| KB-NNNN | Marketplace | Plugin | Slug | Title | Edition | Path | Status |\n' +
        '| --- | --- | --- | --- | --- | --- | --- | --- |\n' +
        '| KB-0005 | test-mp | other | 001-thing | Thing | TODO | other/references/001-thing.md |  |\n',
      'utf8',
    );
    writeSingleLayerPack(cwd, 'example', {
      'gamma.md': { id: 'KB-001', body: 'Gamma body.' },
    });

    const result = migratePack({
      knowledgeDir,
      pack: 'example',
      marketplace: 'test-mp',
    });

    expect(result.migrated).toHaveLength(1);
    const newId = result.migrated[0]!;
    expect(newId).not.toBe('KB-001'); // the old pack-local id is never reused
    expect(newId).toBe('KB-0006'); // freshly allocated, continuing the repo-wide registry

    const packs = loadCorpus(cwd);
    const doc = packs.find((p) => p.name === 'example')!.documents[0]!;
    expect(doc.slug).toBe('001-gamma'); // allocated fresh, no pre-existing ordinal to keep

    const registry = loadRegistry(cwd);
    expect(new Set(registry.map((r) => r.id)).size).toBe(registry.length); // repo-unique
  });

  it('keeps an existing NNN- filename prefix rather than re-allocating it', () => {
    const cwd = root();
    const knowledgeDir = join(cwd, 'knowledge');
    writeSingleLayerPack(cwd, 'example', {
      // A hand-authored single-layer pack that already used the NNN-name
      // filename convention (D-002's "keep an existing NNN- prefix" branch).
      '010-custom.md': { id: 'KB-010', body: 'Custom body.' },
    });

    const result = migratePack({
      knowledgeDir,
      pack: 'example',
      marketplace: 'test-mp',
    });

    expect(result.migrated).toHaveLength(1);
    const packs = loadCorpus(cwd);
    const doc = packs.find((p) => p.name === 'example')!.documents[0]!;
    expect(doc.slug).toBe('010-custom'); // the filename's own ordinal is preserved verbatim
  });
});

describe('migratePack — idempotent and mixed-pack-safe (066, T-202)', () => {
  it('a second run is a no-op', () => {
    const cwd = root();
    const knowledgeDir = join(cwd, 'knowledge');
    writeSingleLayerPack(cwd, 'example', {
      'delta.md': { id: 'KB-001', body: 'Delta body.' },
    });

    const first = migratePack({
      knowledgeDir,
      pack: 'example',
      marketplace: 'test-mp',
    });
    expect(first.migrated).toHaveLength(1);

    const referencesBefore = readFileSync(join(knowledgeDir, 'example', 'references', '001-delta.md'), 'utf8');
    const registryBefore = readFileSync(join(knowledgeDir, 'index.md'), 'utf8');

    const second = migratePack({
      knowledgeDir,
      pack: 'example',
      marketplace: 'test-mp',
    });
    expect(second.migrated).toHaveLength(0);
    expect(second.skipped).toEqual(['001-delta.md']);

    expect(readFileSync(join(knowledgeDir, 'example', 'references', '001-delta.md'), 'utf8')).toBe(referencesBefore);
    expect(readFileSync(join(knowledgeDir, 'index.md'), 'utf8')).toBe(registryBefore);
  });

  it('a run on an already-two-layer pack changes nothing', () => {
    const cwd = root();
    const knowledgeDir = join(cwd, 'knowledge');
    writeTwoLayerDoc(cwd, 'example', '001-epsilon', 'Epsilon body.');
    expect(existsSync(join(knowledgeDir, 'example', 'index.md'))).toBe(false);

    const result = migratePack({
      knowledgeDir,
      pack: 'example',
      marketplace: 'test-mp',
    });

    expect(result.migrated).toHaveLength(0);
    expect(result.skipped).toEqual(['001-epsilon.md']);
    expect(loadRegistry(cwd)).toHaveLength(0); // untouched — never registered by migrate
  });

  it('a mixed pack (some id:, some slug:) converts only the single-layer documents', () => {
    const cwd = root();
    const knowledgeDir = join(cwd, 'knowledge');
    writeSingleLayerPack(cwd, 'example', {
      'zeta.md': { id: 'KB-001', body: 'Zeta body.' },
    });
    writeTwoLayerDoc(cwd, 'example', '002-eta', 'Eta body, already two-layer.');
    const alreadyTwoLayerRaw = readFileSync(join(knowledgeDir, 'example', 'references', '002-eta.md'), 'utf8');

    const result = migratePack({
      knowledgeDir,
      pack: 'example',
      marketplace: 'test-mp',
    });

    expect(result.migrated).toHaveLength(1);
    expect(result.skipped).toEqual(['002-eta.md']);
    // The already-two-layer document is byte-for-byte untouched.
    expect(readFileSync(join(knowledgeDir, 'example', 'references', '002-eta.md'), 'utf8')).toBe(alreadyTwoLayerRaw);
    // The pack index is gone — every document is now two-layer.
    expect(existsSync(join(knowledgeDir, 'example', 'index.md'))).toBe(false);

    const packs = loadCorpus(cwd);
    const pack = packs.find((p) => p.name === 'example')!;
    expect(pack.documents).toHaveLength(2);
    expect(pack.documents.every((d) => d.id === null && !!d.slug)).toBe(true);
  });
});
