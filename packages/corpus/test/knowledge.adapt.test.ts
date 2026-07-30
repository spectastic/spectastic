import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { adaptCorpus } from '../src/knowledge/adapt.js';
import { loadCorpus, loadRegistry, parseSkillSlugMap } from '../src/knowledge/index.js';
import { corpusWellFormedFindings } from '../src/knowledge/validate.js';
import { KB_ID_RE } from '../src/knowledge/types.js';

/**
 * 066-corpus-single-layer-retire: red-first tests for adaptCorpus's two-layer
 * re-base (T-100/T-101) — adapt now files through the same `registerDocument`
 * backbone `convert` uses (065): a `slug:` document, a repo-unique `KB-NNNN`
 * root-registry row, and a `SKILL.md` — never a document `id:`, never a
 * pack-local `index.md` (FR-001, SC-002). Supersedes 056's original
 * single-layer assertions.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A temp source folder of N raw (un-adapted) markdown files, no frontmatter. */
function rawFolder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-adapt-src-'));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body);
  }
  dirs.push(dir);
  return dir;
}

/** A temp project root — the destination `knowledge/` lives under here. */
function projectRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-adapt-dest-'));
  dirs.push(dir);
  return dir;
}

describe('adaptCorpus — folder mode produces two-layer output (066, T-100)', () => {
  it('adapting N raw markdown files yields N registry-cited slug documents + a SKILL.md, no pack index.md', () => {
    const source = rawFolder({
      'alpha.md': '# Alpha\n\nFirst doc body.\n',
      'beta.md': '# Beta\n\nSecond doc body.\n',
      'gamma.md': '# Gamma\n\nThird doc body.\n',
    });
    const cwd = projectRoot();
    const knowledgeDir = join(cwd, 'knowledge');

    const result = adaptCorpus({ target: source, knowledgeDir, pack: 'example', marketplace: 'test-mp' });

    expect(result.written).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);
    expect(result.registryRows).toBe(3);

    const packs = loadCorpus(cwd);
    const pack = packs.find((p) => p.name === 'example');
    expect(pack).toBeDefined();
    expect(pack!.documents).toHaveLength(3);
    // Two-layer: slug set, no document-level id, no pack-local index.
    expect(pack!.documents.every((d) => d.id === null && !!d.slug)).toBe(true);
    expect(pack!.index).toHaveLength(0);
    expect(existsSync(join(knowledgeDir, 'example', 'index.md'))).toBe(false);

    // Registry-cited: one root-registry row per document, repo-unique KB-NNNN.
    const registry = loadRegistry(cwd);
    expect(registry).toHaveLength(3);
    expect(new Set(registry.map((r) => r.id)).size).toBe(3);
    expect(registry.every((r) => KB_ID_RE.test(r.id))).toBe(true);

    // adapt emits a minimal SKILL.md so the pack functions as an Agent Skill
    // (057; enforced by the corpus-well-formed SKILL-presence gate, 065 T-003).
    expect(existsSync(join(knowledgeDir, 'example', 'SKILL.md'))).toBe(true);
    expect(pack!.hasSkillFile).toBe(true);

    // The whole pack validates clean — SC-001's "spectastic validate accepts" leg.
    expect(corpusWellFormedFindings(packs)).toEqual([]);
  });
});

describe('adaptCorpus — llms.txt index-seed mode produces two-layer output (066, T-100)', () => {
  it('an llms.txt with M linked entries yields M registry rows whose title/description trace to it', () => {
    const source = rawFolder({
      'delta.md': '# Delta\n\nDelta body.\n',
      'epsilon.md': '# Epsilon\n\nEpsilon body.\n',
    });
    writeFileSync(
      join(source, 'llms.txt'),
      [
        '# Example Docs',
        '',
        '> A tiny curated index.',
        '',
        '## Docs',
        '',
        '- [Delta Doc](delta.md): The delta entry, from the index.',
        '- [Epsilon Doc](epsilon.md): The epsilon entry, from the index.',
        '',
      ].join('\n'),
    );
    const cwd = projectRoot();
    const knowledgeDir = join(cwd, 'knowledge');

    const result = adaptCorpus({ target: join(source, 'llms.txt'), knowledgeDir, pack: 'example', marketplace: 'test-mp' });

    expect(result.written).toHaveLength(2);
    expect(result.registryRows).toBe(2);

    const registry = loadRegistry(cwd);
    const titles = registry.map((r) => r.title).sort();
    expect(titles).toEqual(['Delta Doc', 'Epsilon Doc']);

    // Descriptions land in the pack's SKILL.md slug map (the registry has no
    // description column) — traced to the llms.txt entries, not re-derived.
    const skillBody = readFileSync(join(knowledgeDir, 'example', 'SKILL.md'), 'utf8');
    const slugRows = parseSkillSlugMap(skillBody);
    const descriptions = slugRows.map((r) => r.description).sort();
    expect(descriptions).toEqual(['The delta entry, from the index.', 'The epsilon entry, from the index.']);

    const packs = loadCorpus(cwd);
    const pack = packs.find((p) => p.name === 'example')!;
    expect(pack.documents).toHaveLength(2);
    expect(pack.documents.every((d) => d.id === null && !!d.slug)).toBe(true);
    expect(pack.index).toHaveLength(0);
  });
});

describe('adaptCorpus — never fabricated (066)', () => {
  it('a source with no discernible license/origin yields TODO exactly, never a guessed value', () => {
    const source = rawFolder({ 'zeta.md': '# Zeta\n\nZeta body, no metadata anywhere in it.\n' });
    const cwd = projectRoot();
    const knowledgeDir = join(cwd, 'knowledge');

    adaptCorpus({ target: source, knowledgeDir, pack: 'example', marketplace: 'test-mp' });

    const packs = loadCorpus(cwd);
    const doc = packs.find((p) => p.name === 'example')!.documents[0]!;
    const raw = readFileSync(join(knowledgeDir, doc.filePath), 'utf8');
    expect(raw).toMatch(/^license: TODO$/m);
    expect(raw).toMatch(/^origin: TODO$/m);
    expect(raw).toMatch(/^origin-url: TODO$/m);
    expect(raw).toMatch(/^edition: TODO$/m);
    // The one field never TODO'd — always computed from the real bytes.
    expect(raw).toMatch(/^content-hash: sha256:[0-9a-f]{64}$/m);
  });
});

describe('adaptCorpus — idempotent re-run (066, T-101)', () => {
  it('re-running on its own output produces no duplicate ids or registry rows', () => {
    const source = rawFolder({
      'one.md': '# One\n\nBody one.\n',
      'two.md': '# Two\n\nBody two.\n',
    });
    const cwd = projectRoot();
    const knowledgeDir = join(cwd, 'knowledge');

    const first = adaptCorpus({ target: source, knowledgeDir, pack: 'example', marketplace: 'test-mp' });
    const second = adaptCorpus({ target: source, knowledgeDir, pack: 'example', marketplace: 'test-mp' });

    expect(first.written).toHaveLength(2);
    expect(second.written).toHaveLength(0);
    expect(second.skipped).toHaveLength(2);
    expect(second.registryRows).toBe(2); // no duplicate rows

    const registry = loadRegistry(cwd);
    expect(new Set(registry.map((r) => r.id)).size).toBe(registry.length); // no duplicate ids
  });

  it('a hand-corrected provenance field survives a second run untouched', () => {
    const source = rawFolder({ 'three.md': '# Three\n\nBody three.\n' });
    const cwd = projectRoot();
    const knowledgeDir = join(cwd, 'knowledge');

    adaptCorpus({ target: source, knowledgeDir, pack: 'example', marketplace: 'test-mp' });

    const packs = loadCorpus(cwd);
    const docPath = join(knowledgeDir, packs.find((p) => p.name === 'example')!.documents[0]!.filePath);
    const handCorrected = readFileSync(docPath, 'utf8').replace('license: TODO', 'license: MIT');
    writeFileSync(docPath, handCorrected, 'utf8');

    adaptCorpus({ target: source, knowledgeDir, pack: 'example', marketplace: 'test-mp' });

    const afterSecondRun = readFileSync(docPath, 'utf8');
    expect(afterSecondRun).toMatch(/^license: MIT$/m);
    expect(afterSecondRun).not.toMatch(/^license: TODO$/m);
  });
});
