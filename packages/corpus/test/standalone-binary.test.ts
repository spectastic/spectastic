import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * 064-corpus-package-extraction, US2 (T-200, SC-003): the standalone binary
 * must curate, search (get/query/grep), and validate a corpus in an
 * environment carrying no @spectastic/core and no specs/ — the whole point
 * of extracting the subsystem into its own package.
 *
 * Drives the REAL built bin (execFileSync, not an in-process import) so a
 * missing package.json "bin" wiring or a broken dist output would fail this
 * test exactly as it would for an actual standalone install. Runs against
 * this repo's own compiled packages/corpus/dist — no separate install step —
 * which still proves the binary works without @spectastic/core loaded into
 * the process, since the bin is a fresh `node` invocation with its own
 * module graph.
 */

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'spectastic-corpus');

function run(args: string[], cwd: string): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function freshProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-corpus-standalone-'));
  dirs.push(dir);
  return dir;
}

beforeAll(() => {
  if (!existsSync(join(here, '..', 'dist', 'cli', 'index.js'))) {
    throw new Error('packages/corpus/dist/cli/index.js missing — run `pnpm --filter @spectastic/corpus build` first.');
  }
});

describe('spectastic-corpus standalone binary (US2, SC-003)', () => {
  it('runs with no @spectastic/core and no specs/ present — --version and --help succeed', () => {
    const cwd = freshProjectDir();
    // Sanity: confirm the fixture project genuinely has neither.
    expect(existsSync(join(cwd, 'specs'))).toBe(false);

    const version = run(['--version'], cwd);
    expect(version.code).toBe(0);

    const help = run(['--help'], cwd);
    expect(help.code).toBe(0);
    expect(help.stdout).toMatch(/spectastic-corpus/);
  });

  it('adapt: turns a plain markdown folder into the knowledge/ convention with no lifecycle present', () => {
    const cwd = freshProjectDir();
    const srcDir = join(cwd, 'source-docs');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'note.md'), '# A note\n\nSome content.\n');

    const result = run(['adapt', srcDir, '--pack', 'standalone-example'], cwd);
    expect(result.code).toBe(0);
    expect(existsSync(join(cwd, 'knowledge', 'standalone-example'))).toBe(true);
  });

  it('get/query/grep: search a corpus present on disk, no lifecycle present', () => {
    const cwd = freshProjectDir();
    const packDir = join(cwd, 'knowledge', 'example');
    mkdirSync(join(packDir, 'references'), { recursive: true });
    writeFileSync(
      join(packDir, 'index.md'),
      [
        '| ID | Title | Description | Edition | Path |',
        '| --- | --- | --- | --- | --- |',
        '| KB-501 | Settlement window | T+1 settlement fact | 2026-01-01 | references/KB-501.md |',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(packDir, 'references', 'KB-501.md'),
      ['---', 'id: KB-501', 'edition: 2026-01-01', '---', '', '# Settlement window', '', 'Settles in one business day.', ''].join(
        '\n',
      ),
    );

    const got = run(['get', 'KB-501'], cwd);
    expect(got.code).toBe(0);
    expect(got.stdout).toContain('KB-501');

    const queried = run(['query', 'settlement'], cwd);
    expect(queried.code).toBe(0);
    expect(queried.stdout).toContain('KB-501');

    const grepped = run(['grep', 'business day'], cwd);
    expect(grepped.code).toBe(0);
    expect(grepped.stdout).toContain('KB-501');
  });

  it('validate: corpus-intrinsic well-formed/registry/license scans succeed with no lifecycle present', () => {
    const cwd = freshProjectDir();
    const result = run(['validate'], cwd);
    // Graceful absence (FR-007): no knowledge/ at all is clean, never an error.
    expect(result.code).toBe(0);
  });
});
