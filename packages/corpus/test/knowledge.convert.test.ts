import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONVERTERS,
  type ConverterSpec,
  convertDocument,
  ExecFileConverterRunner,
  resolveConverterSpec,
  StubConverterRunner,
} from '../src/knowledge/convert.js';
import { parseRegistry } from '../src/knowledge/index-format.js';
import type { RegistryEntry } from '../src/knowledge/types.js';

const FIXTURE_CONVERTER = fileURLToPath(new URL('./fixtures/fake-converter.mjs', import.meta.url));
const MKT = 'test-marketplace';

/**
 * 065-corpus-pdf-convert, incl. the 2026-07-28 two-layer re-base (T-1000..T-1004):
 * the ConverterRunner port + CONVERTERS validation, and — the re-base — convert
 * registering a *two-layer* document (root-registry KB-NNNN row + slug: frontmatter
 * + SKILL.md + NNN-slug filename), with the source-bytes content-hash preserved (FR-004).
 */

describe('ConverterRunner — StubConverterRunner (T-010)', () => {
  it('returns the configured canned output without spawning a process', async () => {
    const runner = new StubConverterRunner({ stdout: '# canned markdown\n' });
    const result = await runner.run('markitdown', ['paper.pdf']);
    expect(result.stdout).toBe('# canned markdown\n');
  });

  it('records every call it received, for assertions on argv shape', async () => {
    const runner = new StubConverterRunner({ stdout: 'x' });
    await runner.run('docling', ['paper.pdf', '--to', 'md', '--output', '/tmp/x']);
    expect(runner.calls).toEqual([
      {
        bin: 'docling',
        argv: ['paper.pdf', '--to', 'md', '--output', '/tmp/x'],
        opts: undefined,
      },
    ]);
  });
});

describe('resolveConverterSpec — registry lookup (T-010)', () => {
  it('resolves a registered converter name to its spec', () => {
    const spec = resolveConverterSpec('markitdown');
    expect(spec).toBe(CONVERTERS.markitdown);
  });

  it('rejects an unrecognised converter name before anything runs', () => {
    expect(() => resolveConverterSpec('not-a-real-converter')).toThrow(/unknown converter/i);
  });
});

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tempSourceFile(name: string, bytes: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-convert-src-'));
  dirs.push(dir);
  const filePath = join(dir, name);
  writeFileSync(filePath, bytes);
  return filePath;
}

function tempKnowledgeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-convert-dest-'));
  dirs.push(dir);
  return join(dir, 'knowledge');
}

/** Read the filed document (result.filePath is `<pack>/references/<slug>.md`, relative to knowledgeDir). */
function readFiled(knowledgeDir: string, filePath: string): string {
  return readFileSync(join(knowledgeDir, filePath), 'utf8');
}

/** Parse the root registry (`knowledge/index.md`). */
function readRegistry(knowledgeDir: string): RegistryEntry[] {
  const path = join(knowledgeDir, 'index.md');
  return existsSync(path) ? parseRegistry(readFileSync(path, 'utf8')) : [];
}

describe('convertDocument — US1: default convert registers a two-layer document (T-100/T-1004)', () => {
  it('files a slug: document at references/<NNN-slug>.md, a root-registry KB-NNNN row, and a SKILL.md', async () => {
    const sourceFile = tempSourceFile('paper.pdf', 'the original pdf bytes');
    const knowledgeDir = tempKnowledgeDir();
    const runner = new StubConverterRunner({
      stdout: '# Converted\n\nBody text.\n',
    });

    const result = await convertDocument({
      sourceFile,
      knowledgeDir,
      pack: 'research',
      marketplace: MKT,
      runner,
    });

    // NNN-slug filename + returned path.
    expect(result.filePath).toBe('research/references/001-paper.md');
    expect(result.id).toMatch(/^KB-\d{3,}$/);

    // Two-layer document: slug: frontmatter, never a document id:.
    const filed = readFiled(knowledgeDir, result.filePath!);
    expect(filed).toContain('slug: 001-paper');
    expect(filed).not.toMatch(/^id: KB-/m);
    expect(filed).toContain('# Converted');
    expect(filed).toContain('converter: markitdown');

    // Root-registry row (the registry is authoritative, 062 FR-006).
    const row = readRegistry(knowledgeDir).find((r) => r.id === result.id);
    expect(row).toMatchObject({
      marketplace: MKT,
      plugin: 'research',
      slug: '001-paper',
    });

    // SKILL.md created — the pack functions as an Agent Skill (057; the 065 T-003 gate).
    expect(existsSync(join(knowledgeDir, 'research', 'SKILL.md'))).toBe(true);

    // markitdown's own default argv shape: just the file.
    expect(runner.calls[0]?.bin).toBe('markitdown');
    expect(runner.calls[0]?.argv).toEqual([sourceFile]);
  });

  it('requires a marketplace when filing into a pack (two-layer registration)', async () => {
    const sourceFile = tempSourceFile('paper.pdf', 'bytes');
    const knowledgeDir = tempKnowledgeDir();
    const runner = new StubConverterRunner({ stdout: '# x\n' });
    await expect(convertDocument({ sourceFile, knowledgeDir, pack: 'research', runner })).rejects.toThrow(
      /marketplace/i,
    );
  });

  it('is idempotent — re-converting the same source reuses its slug and mints no duplicate registry row', async () => {
    const sourceFile = tempSourceFile('paper.pdf', 'source bytes');
    const knowledgeDir = tempKnowledgeDir();
    const runner = new StubConverterRunner({ stdout: '# Converted\n' });

    const first = await convertDocument({
      sourceFile,
      knowledgeDir,
      pack: 'research',
      marketplace: MKT,
      runner,
    });
    const second = await convertDocument({
      sourceFile,
      knowledgeDir,
      pack: 'research',
      marketplace: MKT,
      runner,
    });

    expect(second.filePath).toBe(first.filePath);
    const rows = readRegistry(knowledgeDir).filter((r) => r.plugin === 'research');
    expect(rows).toHaveLength(1);
  });
});

/** Wraps a real registry entry so it runs the fixture shim (via `node`) instead of
 * the real binary, keeping its own buildArgs/collectOutput shape intact (T-200/T-211). */
function fixtureSpec(real: ConverterSpec): ConverterSpec {
  return {
    ...real,
    bin: 'node',
    buildArgs: (file, tmpDir) => [FIXTURE_CONVERTER, ...real.buildArgs(file, tmpDir)],
  };
}

describe('convertDocument — US2: --converter routes to the right registry entry (T-200)', () => {
  it('routes --converter docling to the docling shape and records it in provenance', async () => {
    const sourceFile = tempSourceFile('paper.pdf', 'real bytes');
    const knowledgeDir = tempKnowledgeDir();

    const result = await convertDocument({
      sourceFile,
      knowledgeDir,
      pack: 'research',
      marketplace: MKT,
      converter: 'docling',
      runner: new ExecFileConverterRunner(),
      registry: { docling: fixtureSpec(CONVERTERS.docling) },
    });

    const filed = readFiled(knowledgeDir, result.filePath!);
    expect(filed).toContain('converter: docling');
    expect(filed).toContain('# Converted: paper');
  });

  it('routes --converter marker to the marker shape (its own output subfolder) and records it', async () => {
    const sourceFile = tempSourceFile('paper.pdf', 'real bytes');
    const knowledgeDir = tempKnowledgeDir();

    const result = await convertDocument({
      sourceFile,
      knowledgeDir,
      pack: 'research',
      marketplace: MKT,
      converter: 'marker',
      runner: new ExecFileConverterRunner(),
      registry: { marker: fixtureSpec(CONVERTERS.marker) },
    });

    const filed = readFiled(knowledgeDir, result.filePath!);
    expect(filed).toContain('converter: marker');
    expect(filed).toContain('# Converted: paper');
  });
});

describe('resolveConverterSpec — US2: unrecognised converter rejected pre-run (T-201)', () => {
  it('throws before any process runs, even against a custom registry', async () => {
    const sourceFile = tempSourceFile('paper.pdf', 'bytes');
    const knowledgeDir = tempKnowledgeDir();
    const runner = new StubConverterRunner({
      stdout: 'should never be reached',
    });

    await expect(
      convertDocument({
        sourceFile,
        knowledgeDir,
        pack: 'research',
        marketplace: MKT,
        converter: 'not-a-real-converter',
        runner,
      }),
    ).rejects.toThrow(/unknown converter/i);

    expect(runner.calls).toHaveLength(0);
  });
});

describe('convertDocument — US3: content-hash pins the SOURCE, preserved through the backbone (T-300/FR-004)', () => {
  it('the filed content-hash equals the SHA-256 of the original file bytes, not the markdown', async () => {
    const sourceFile = tempSourceFile('paper.pdf', 'the real source bytes');
    const knowledgeDir = tempKnowledgeDir();
    const runner = new StubConverterRunner({
      stdout: '# Totally different markdown text, not the source\n',
    });

    const result = await convertDocument({
      sourceFile,
      knowledgeDir,
      pack: 'research',
      marketplace: MKT,
      runner,
    });

    const filed = readFiled(knowledgeDir, result.filePath!);
    const expectedHash = `sha256:${createHash('sha256').update('the real source bytes', 'utf8').digest('hex')}`;
    expect(filed).toContain(`content-hash: ${expectedHash}`);
  });
});

describe('convertDocument — US3: converter + origin recorded, TODO otherwise (T-301)', () => {
  it('records the converter name PLUS a probed version, and origin as the source filename', async () => {
    const sourceFile = tempSourceFile('paper.pdf', 'bytes');
    const knowledgeDir = tempKnowledgeDir();
    const runner = new StubConverterRunner((_bin, argv) =>
      argv.includes('--version') ? { stdout: 'markitdown 1.2.3\n' } : { stdout: '# Converted\n' },
    );

    const result = await convertDocument({
      sourceFile,
      knowledgeDir,
      pack: 'research',
      marketplace: MKT,
      runner,
    });

    const filed = readFiled(knowledgeDir, result.filePath!);
    expect(filed).toContain('converter: markitdown 1.2.3');
    expect(filed).toContain('origin: paper.pdf');
  });

  it('falls back to the bare converter name (no probe attempted) when the spec has no versionArgs', async () => {
    const sourceFile = tempSourceFile('paper.pdf', 'bytes');
    const knowledgeDir = tempKnowledgeDir();
    const noVersionSpec: ConverterSpec = {
      bin: 'whatever-tool',
      buildArgs: (file) => [file],
      collectOutput: (run) => run.stdout,
      installHint: 'n/a',
    };
    const runner = new StubConverterRunner({ stdout: '# Converted\n' });

    const result = await convertDocument({
      sourceFile,
      knowledgeDir,
      pack: 'research',
      marketplace: MKT,
      converter: 'whatever-tool',
      runner,
      registry: { 'whatever-tool': noVersionSpec },
    });

    const filed = readFiled(knowledgeDir, result.filePath!);
    expect(filed).toContain('converter: whatever-tool\n');
    expect(runner.calls).toHaveLength(1);
  });
});

describe('convertDocument — FR-007: title/description overrides + filename-stem fallback (T-1003)', () => {
  it('--title / --description set the registry title and the SKILL slug-map description', async () => {
    const sourceFile = tempSourceFile('dodbook.pdf', 'bytes');
    const knowledgeDir = tempKnowledgeDir();
    const runner = new StubConverterRunner({
      stdout: '# noisy pdf heading\n\nnoisy first paragraph\n',
    });

    const result = await convertDocument({
      sourceFile,
      knowledgeDir,
      pack: 'research',
      marketplace: MKT,
      runner,
      title: 'Data-Oriented Design',
      description: 'A hand-written summary of the book.',
    });

    const row = readRegistry(knowledgeDir).find((r) => r.id === result.id);
    expect(row?.title).toBe('Data-Oriented Design');
    const skill = readFileSync(join(knowledgeDir, 'research', 'SKILL.md'), 'utf8');
    expect(skill).toContain('A hand-written summary of the book.');
  });

  it('falls back to the humanised filename stem for the title when there is no heading and no --title', async () => {
    const sourceFile = tempSourceFile('dodbook.pdf', 'bytes');
    const knowledgeDir = tempKnowledgeDir();
    const runner = new StubConverterRunner({
      stdout: 'no heading here, just prose\n',
    });

    const result = await convertDocument({
      sourceFile,
      knowledgeDir,
      pack: 'research',
      marketplace: MKT,
      runner,
    });

    const row = readRegistry(knowledgeDir).find((r) => r.id === result.id);
    expect(row?.title).toBe('Dodbook');
  });
});
