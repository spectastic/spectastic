import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fileConvertedDocument } from '../src/knowledge/adapt.js';
import { parseIndex } from '../src/knowledge/index-format.js';
import {
  convertDocument,
  CONVERTERS,
  resolveConverterSpec,
  ExecFileConverterRunner,
  StubConverterRunner,
  type ConverterSpec,
} from '../src/knowledge/convert.js';

const FIXTURE_CONVERTER = fileURLToPath(new URL('./fixtures/fake-converter.mjs', import.meta.url));

/**
 * 065-corpus-pdf-convert, Foundational (T-010/T-011, plan D-001/D-002): the
 * ConverterRunner port (stub for tests, execFile-backed for real) and the
 * CONVERTERS registry's name-validation lookup — the "unrecognised converter
 * is rejected before any process runs" guarantee (FR-002) starts here.
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
    expect(runner.calls).toEqual([{ bin: 'docling', argv: ['paper.pdf', '--to', 'md', '--output', '/tmp/x'], opts: undefined }]);
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

describe('fileConvertedDocument — source-bytes hash + converter stamping (T-012)', () => {
  it("hashes the SOURCE file's bytes into content-hash, not the converted markdown", () => {
    const sourceFile = tempSourceFile('paper.pdf', 'these are the original source bytes');
    const knowledgeDir = tempKnowledgeDir();

    const result = fileConvertedDocument({
      sourceFile,
      markdown: '# Converted\n\nSome markdown text that is NOT the source bytes.\n',
      knowledgeDir,
      pack: 'research',
      converter: 'markitdown',
    });

    const filed = readFileSync(join(knowledgeDir, 'research', result.filePath), 'utf8');
    const expectedHash = `sha256:${createHash('sha256').update('these are the original source bytes', 'utf8').digest('hex')}`;
    expect(filed).toContain(`content-hash: ${expectedHash}`);
  });

  it('records converter and origin, and files through the same index/id machinery as adapt', () => {
    const sourceFile = tempSourceFile('paper.pdf', 'source bytes');
    const knowledgeDir = tempKnowledgeDir();

    const result = fileConvertedDocument({
      sourceFile,
      markdown: '# Converted\n\nBody.\n',
      knowledgeDir,
      pack: 'research',
      converter: 'markitdown 1.2.3',
    });

    const filed = readFileSync(join(knowledgeDir, 'research', result.filePath), 'utf8');
    expect(filed).toContain('converter: markitdown 1.2.3');
    expect(filed).toContain('origin: paper.pdf');
    expect(result.id).toMatch(/^KB-\d{3,}$/);

    const index = parseIndex(readFileSync(join(knowledgeDir, 'research', 'index.md'), 'utf8'));
    expect(index.some((row) => row.id === result.id)).toBe(true);
  });

  it('is idempotent — re-filing the same source leaves the existing document untouched', () => {
    const sourceFile = tempSourceFile('paper.pdf', 'source bytes');
    const knowledgeDir = tempKnowledgeDir();

    const first = fileConvertedDocument({ sourceFile, markdown: '# v1\n', knowledgeDir, pack: 'research', converter: 'markitdown' });
    const second = fileConvertedDocument({ sourceFile, markdown: '# v2 — should be ignored\n', knowledgeDir, pack: 'research', converter: 'markitdown' });

    expect(second.id).toBe(first.id);
    const filed = readFileSync(join(knowledgeDir, 'research', first.filePath), 'utf8');
    expect(filed).toContain('# v1');
    expect(filed).not.toContain('should be ignored');
  });
});

describe('convertDocument — US1: default convert files a doc into a pack (T-100)', () => {
  it('with the stub runner, the default (markitdown) path files a citable document into the pack', async () => {
    const sourceFile = tempSourceFile('paper.pdf', 'the original pdf bytes');
    const knowledgeDir = tempKnowledgeDir();
    const runner = new StubConverterRunner({ stdout: '# Converted\n\nBody text.\n' });

    const result = await convertDocument({ sourceFile, knowledgeDir, pack: 'research', runner });

    expect(result.id).toMatch(/^KB-\d{3,}$/);
    const filed = readFileSync(join(knowledgeDir, 'research', result.filePath), 'utf8');
    expect(filed).toContain('# Converted');
    expect(filed).toContain('converter: markitdown');

    const index = parseIndex(readFileSync(join(knowledgeDir, 'research', 'index.md'), 'utf8'));
    expect(index.some((row) => row.id === result.id)).toBe(true);

    // The stub runner proves markitdown's own default argv shape was used: just the file.
    expect(runner.calls[0]?.bin).toBe('markitdown');
    expect(runner.calls[0]?.argv).toEqual([sourceFile]);
  });
});

/** Wraps a real registry entry so it runs the fixture shim (via `node`) instead of
 * the real binary, keeping its own buildArgs/collectOutput shape intact — proves the
 * registry entry's argv/output-collection contract against a real child process
 * without needing markitdown/docling/marker actually installed (T-200/T-211). */
function fixtureSpec(real: ConverterSpec): ConverterSpec {
  return { ...real, bin: 'node', buildArgs: (file, tmpDir) => [FIXTURE_CONVERTER, ...real.buildArgs(file, tmpDir)] };
}

describe('convertDocument — US2: --converter routes to the right registry entry (T-200)', () => {
  it('routes --converter docling to the docling shape and files provenance naming it', async () => {
    const sourceFile = tempSourceFile('paper.pdf', 'real bytes');
    const knowledgeDir = tempKnowledgeDir();
    const registry = { docling: fixtureSpec(CONVERTERS.docling) };

    const result = await convertDocument({
      sourceFile,
      knowledgeDir,
      pack: 'research',
      converter: 'docling',
      runner: new ExecFileConverterRunner(),
      registry,
    });

    const filed = readFileSync(join(knowledgeDir, 'research', result.filePath), 'utf8');
    expect(filed).toContain('converter: docling');
    expect(filed).toContain('# Converted: paper');
  });

  it('routes --converter marker to the marker shape (its own output subfolder) and files provenance naming it', async () => {
    const sourceFile = tempSourceFile('paper.pdf', 'real bytes');
    const knowledgeDir = tempKnowledgeDir();
    const registry = { marker: fixtureSpec(CONVERTERS.marker) };

    const result = await convertDocument({
      sourceFile,
      knowledgeDir,
      pack: 'research',
      converter: 'marker',
      runner: new ExecFileConverterRunner(),
      registry,
    });

    const filed = readFileSync(join(knowledgeDir, 'research', result.filePath), 'utf8');
    expect(filed).toContain('converter: marker');
    expect(filed).toContain('# Converted: paper');
  });
});

describe('resolveConverterSpec — US2: unrecognised converter rejected pre-run (T-201)', () => {
  it('throws before any process runs, even against a custom registry', async () => {
    const sourceFile = tempSourceFile('paper.pdf', 'bytes');
    const knowledgeDir = tempKnowledgeDir();
    const runner = new StubConverterRunner({ stdout: 'should never be reached' });

    await expect(
      convertDocument({ sourceFile, knowledgeDir, pack: 'research', converter: 'not-a-real-converter', runner }),
    ).rejects.toThrow(/unknown converter/i);

    expect(runner.calls).toHaveLength(0);
  });
});

describe('convertDocument — US3: content-hash pins the SOURCE, not the markdown (T-300)', () => {
  it('the filed content-hash equals the SHA-256 of the original file bytes, through the full orchestrator', async () => {
    const sourceFile = tempSourceFile('paper.pdf', 'the real source bytes');
    const knowledgeDir = tempKnowledgeDir();
    const runner = new StubConverterRunner({ stdout: '# Totally different markdown text, not the source\n' });

    const result = await convertDocument({ sourceFile, knowledgeDir, pack: 'research', runner });

    const filed = readFileSync(join(knowledgeDir, 'research', result.filePath), 'utf8');
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

    const result = await convertDocument({ sourceFile, knowledgeDir, pack: 'research', runner });

    const filed = readFileSync(join(knowledgeDir, 'research', result.filePath), 'utf8');
    expect(filed).toContain('converter: markitdown 1.2.3');
    expect(filed).toContain('origin: paper.pdf');
  });

  it('falls back to the bare converter name (no probe attempted, no fabricated version) when the spec has no versionArgs', async () => {
    const sourceFile = tempSourceFile('paper.pdf', 'bytes');
    const knowledgeDir = tempKnowledgeDir();
    const noVersionSpec: ConverterSpec = {
      bin: 'whatever-tool',
      buildArgs: (file) => [file],
      collectOutput: (run) => run.stdout,
      installHint: 'n/a',
      // deliberately no versionArgs
    };
    const runner = new StubConverterRunner({ stdout: '# Converted\n' });

    const result = await convertDocument({
      sourceFile,
      knowledgeDir,
      pack: 'research',
      converter: 'whatever-tool',
      runner,
      registry: { 'whatever-tool': noVersionSpec },
    });

    const filed = readFileSync(join(knowledgeDir, 'research', result.filePath), 'utf8');
    expect(filed).toContain('converter: whatever-tool\n');
    // Only the one conversion call — no version probe was ever attempted.
    expect(runner.calls).toHaveLength(1);
  });
});
