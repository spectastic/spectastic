import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { adaptCorpus } from '../src/knowledge/adapt.js';
import { loadCorpus } from '../src/knowledge/index.js';
import { corpusWellFormedFindings } from '../src/knowledge/validate.js';

/**
 * 056-corpus-adapter: red-first tests for adaptCorpus (plan D-001–D-005).
 * A deterministic Node generator that shapes an existing corpus shape
 * (a markdown folder, or an llms.txt) into 051's frontmatter + index
 * convention — deriving what it can, marking everything else TODO, never
 * fabricating, and safe to re-run (NFR-001).
 *
 * Setup only (T-001) — temp-dir helpers; assertions land per-story
 * (T-100/T-200/T-300/T-301) as the generator is built.
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

describe('adaptCorpus — folder mode (056, T-100)', () => {
  it('adapting N raw markdown files yields N KB-NNN documents + an N-row index that validate accepts', () => {
    const source = rawFolder({
      'alpha.md': '# Alpha\n\nFirst doc body.\n',
      'beta.md': '# Beta\n\nSecond doc body.\n',
      'gamma.md': '# Gamma\n\nThird doc body.\n',
    });
    const cwd = projectRoot();
    const knowledgeDir = join(cwd, 'knowledge');

    const result = adaptCorpus({ target: source, knowledgeDir, pack: 'example' });

    expect(result.written).toHaveLength(3);
    expect(result.skipped).toHaveLength(0);
    expect(result.indexRows).toBe(3);

    const packs = loadCorpus(cwd);
    const pack = packs.find((p) => p.name === 'example');
    expect(pack).toBeDefined();
    expect(pack!.documents).toHaveLength(3);
    expect(pack!.index).toHaveLength(3);

    // Every emitted document carries a valid KB-NNN id.
    const ids = pack!.documents.map((d) => d.id).sort();
    expect(ids).toEqual(['KB-001', 'KB-002', 'KB-003']);

    // The whole pack validates clean — SC-001's "spectastic validate accepts" leg.
    expect(corpusWellFormedFindings(packs)).toEqual([]);
  });
});

describe('adaptCorpus — llms.txt index-seed mode (056, T-200)', () => {
  it('an llms.txt with M linked entries yields an M-row index whose rows trace to them', () => {
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

    const result = adaptCorpus({ target: join(source, 'llms.txt'), knowledgeDir, pack: 'example' });

    expect(result.written).toHaveLength(2);
    expect(result.indexRows).toBe(2);

    const packs = loadCorpus(cwd);
    const pack = packs.find((p) => p.name === 'example');
    expect(pack).toBeDefined();
    expect(pack!.index).toHaveLength(2);

    // Index rows trace to the llms.txt entries — titles/descriptions come from it, not derived.
    const titles = pack!.index.map((r) => r.title).sort();
    expect(titles).toEqual(['Delta Doc', 'Epsilon Doc']);
    const descriptions = pack!.index.map((r) => r.description).sort();
    expect(descriptions).toEqual(['The delta entry, from the index.', 'The epsilon entry, from the index.']);

    // The linked files gained frontmatter.
    expect(pack!.documents).toHaveLength(2);
    expect(pack!.documents.every((d) => d.id !== null)).toBe(true);
  });
});

describe('adaptCorpus — never fabricated (056, T-300)', () => {
  it('a source with no discernible license/origin yields TODO exactly, never a guessed value', () => {
    const source = rawFolder({ 'zeta.md': '# Zeta\n\nZeta body, no metadata anywhere in it.\n' });
    const cwd = projectRoot();
    const knowledgeDir = join(cwd, 'knowledge');

    adaptCorpus({ target: source, knowledgeDir, pack: 'example' });

    const raw = readFileSync(join(knowledgeDir, 'example', 'references', 'zeta.md'), 'utf8');
    expect(raw).toMatch(/^license: TODO$/m);
    expect(raw).toMatch(/^origin: TODO$/m);
    expect(raw).toMatch(/^origin-url: TODO$/m);
    expect(raw).toMatch(/^edition: TODO$/m);
    // The one field never TODO'd — always computed from the real bytes.
    expect(raw).toMatch(/^content-hash: sha256:[0-9a-f]{64}$/m);
  });
});

describe('adaptCorpus — idempotent re-run (056, T-301)', () => {
  it('re-running on its own output produces no duplicate ids or index rows', () => {
    const source = rawFolder({
      'one.md': '# One\n\nBody one.\n',
      'two.md': '# Two\n\nBody two.\n',
    });
    const cwd = projectRoot();
    const knowledgeDir = join(cwd, 'knowledge');

    const first = adaptCorpus({ target: source, knowledgeDir, pack: 'example' });
    const second = adaptCorpus({ target: source, knowledgeDir, pack: 'example' });

    expect(first.written).toHaveLength(2);
    expect(second.written).toHaveLength(0);
    expect(second.skipped).toHaveLength(2);
    expect(second.indexRows).toBe(2); // no duplicate rows

    const packs = loadCorpus(cwd);
    const pack = packs.find((p) => p.name === 'example')!;
    const ids = pack.documents.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids
  });

  it('a hand-corrected provenance field survives a second run untouched', () => {
    const source = rawFolder({ 'three.md': '# Three\n\nBody three.\n' });
    const cwd = projectRoot();
    const knowledgeDir = join(cwd, 'knowledge');

    adaptCorpus({ target: source, knowledgeDir, pack: 'example' });

    const docPath = join(knowledgeDir, 'example', 'references', 'three.md');
    const handCorrected = readFileSync(docPath, 'utf8').replace('license: TODO', 'license: MIT');
    writeFileSync(docPath, handCorrected, 'utf8');

    adaptCorpus({ target: source, knowledgeDir, pack: 'example' });

    const afterSecondRun = readFileSync(docPath, 'utf8');
    expect(afterSecondRun).toMatch(/^license: MIT$/m);
    expect(afterSecondRun).not.toMatch(/^license: TODO$/m);
  });
});
