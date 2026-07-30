import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONVERTERS,
  ConverterNotFoundError,
  type ConverterRunner,
  type ConverterSpec,
  convertDocument,
  ExecFileConverterRunner,
  StubConverterRunner,
} from '../src/knowledge/convert.js';

/**
 * 065-corpus-pdf-convert, US1 (T-101/T-102) + Polish (T-902): the CLI-facing
 * behaviour convert's orchestrator must guarantee regardless of which CLI surface
 * dispatches to it — a hard, clean failure when the converter binary is absent
 * (FR-003, SC-002), --no-adapt's pack-free raw-emit mode (FR-005, SC-004), and (via
 * the real fixture-shim, not the stub) that a converter's managed scratch dir —
 * including Marker's own per-document subfolder — is always cleaned up.
 */

const FIXTURE_CONVERTER = fileURLToPath(new URL('./fixtures/fake-converter.mjs', import.meta.url));

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tempSourceFile(name: string, bytes: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-convert-cli-src-'));
  dirs.push(dir);
  const filePath = join(dir, name);
  writeFileSync(filePath, bytes);
  return filePath;
}

function tempKnowledgeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-convert-cli-dest-'));
  dirs.push(dir);
  return join(dir, 'knowledge');
}

/** Emulates what Node's real execFile throws when a binary isn't on PATH. */
class ENOENTRunner implements ConverterRunner {
  async run(bin: string): Promise<{ stdout: string }> {
    throw Object.assign(new Error(`spawn ${bin} ENOENT`), { code: 'ENOENT' });
  }
}

describe('convertDocument — missing converter binary (T-101)', () => {
  it('rejects with a ConverterNotFoundError carrying an install hint, and never touches the pack', async () => {
    const sourceFile = tempSourceFile('paper.pdf', 'bytes');
    const knowledgeDir = tempKnowledgeDir();

    await expect(
      convertDocument({
        sourceFile,
        knowledgeDir,
        pack: 'research',
        runner: new ENOENTRunner(),
      }),
    ).rejects.toMatchObject({
      name: 'ConverterNotFoundError',
      installHint: expect.stringContaining('markitdown'),
    });

    // No partial write — the pack directory was never created.
    expect(existsSync(join(knowledgeDir, 'research'))).toBe(false);
  });
});

describe('convertDocument — --no-adapt raw-emit (T-102)', () => {
  it('returns the converted markdown without touching any pack when no target is given', async () => {
    const sourceFile = tempSourceFile('paper.pdf', 'bytes');
    const runner = new StubConverterRunner({ stdout: '# Raw output\n' });

    const result = await convertDocument({ sourceFile, runner, noAdapt: true });

    expect(result.markdown).toBe('# Raw output\n');
    expect(result.id).toBeUndefined();
    expect(result.filePath).toBeUndefined();
  });

  it('writes to --out <path> instead, and still creates no pack', async () => {
    const sourceFile = tempSourceFile('paper.pdf', 'bytes');
    const runner = new StubConverterRunner({ stdout: '# Raw output\n' });
    const outDir = mkdtempSync(join(tmpdir(), 'spectastic-convert-out-'));
    dirs.push(outDir);
    const outPath = join(outDir, 'paper.md');

    const result = await convertDocument({
      sourceFile,
      runner,
      noAdapt: true,
      out: outPath,
    });

    expect(readFileSync(outPath, 'utf8')).toBe('# Raw output\n');
    expect(result.id).toBeUndefined();
  });
});

/** Wraps the real marker spec to run the fixture shim (via `node`), capturing the
 * managed tmpDir it was given so the test can assert on it after the run. */
function markerFixtureSpec(captureTmpDir: (dir: string) => void): ConverterSpec {
  const real = CONVERTERS.marker;
  return {
    ...real,
    bin: 'node',
    buildArgs: (file, tmpDir) => {
      captureTmpDir(tmpDir);
      return [FIXTURE_CONVERTER, ...real.buildArgs(file, tmpDir)];
    },
  };
}

describe('convertDocument — Polish: the managed tmpDir is always cleaned up (T-902)', () => {
  it("removes the tmpDir — including Marker's own per-document subfolder — after a successful run", async () => {
    const sourceFile = tempSourceFile('paper.pdf', 'real bytes, really converted');
    const knowledgeDir = tempKnowledgeDir();
    let capturedTmpDir = '';

    const result = await convertDocument({
      sourceFile,
      knowledgeDir,
      pack: 'research',
      marketplace: 'test-marketplace',
      converter: 'marker',
      runner: new ExecFileConverterRunner(),
      registry: { marker: markerFixtureSpec((d) => (capturedTmpDir = d)) },
    });

    expect(result.id).toMatch(/^KB-\d{3,}$/);
    expect(capturedTmpDir).not.toBe('');
    // The fixture actually wrote a nested <tmpDir>/<stem>/<stem>.md — confirming the
    // whole tree, not just an empty dir, is gone.
    expect(existsSync(capturedTmpDir)).toBe(false);
  });

  it('removes the tmpDir even when the run fails (missing-binary path)', async () => {
    const sourceFile = tempSourceFile('paper.pdf', 'bytes');
    const knowledgeDir = tempKnowledgeDir();
    let capturedTmpDir = '';
    const failingSpec: ConverterSpec = {
      ...CONVERTERS.marker,
      buildArgs: (file, tmpDir) => {
        capturedTmpDir = tmpDir;
        return CONVERTERS.marker.buildArgs(file, tmpDir);
      },
    };

    await expect(
      convertDocument({
        sourceFile,
        knowledgeDir,
        pack: 'research',
        converter: 'marker',
        runner: new ENOENTRunner(),
        registry: { marker: failingSpec },
      }),
    ).rejects.toBeInstanceOf(ConverterNotFoundError);

    expect(capturedTmpDir).not.toBe('');
    expect(existsSync(capturedTmpDir)).toBe(false);
  });
});
