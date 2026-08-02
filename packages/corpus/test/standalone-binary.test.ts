import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
    const stdout = execFileSync('node', [BIN, ...args], {
      cwd,
      encoding: 'utf8',
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      code: e.status ?? 1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
    };
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
      [
        '---',
        'id: KB-501',
        'edition: 2026-01-01',
        '---',
        '',
        '# Settlement window',
        '',
        'Settles in one business day.',
        '',
      ].join('\n'),
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

/**
 * 078-federated-resource-uri T-101: red-first test for the `id` verb —
 * renders a corpus document's federation-unique spectastic:// coordinate
 * with no @spectastic/core and no specs/ present (FR-010, SC-003).
 */
describe('spectastic-corpus id (078 US1, FR-010/SC-003)', () => {
  function seedRegisteredDoc(cwd: string): void {
    const packDir = join(cwd, 'knowledge', 'spectastic-concepts');
    mkdirSync(join(packDir, 'references'), { recursive: true });
    writeFileSync(
      join(packDir, 'index.md'),
      [
        '| ID | Title | Description | Edition | Path |',
        '| --- | --- | --- | --- | --- |',
        '| KB-501 | Foundations | Core concepts | 2026-01-01 | references/KB-501.md |',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(packDir, 'references', 'KB-501.md'),
      ['---', 'id: KB-501', 'edition: 2026-01-01', '---', '', '# Foundations', '', 'Body.', ''].join('\n'),
    );
    // The root registry is what carries marketplace/plugin/slug (FR-001/FR-002) —
    // an index.md-only pack has no coordinate to render (registry-less is a
    // pre-062 shape; this test seeds the two-layer registry directly).
    writeFileSync(
      join(cwd, 'knowledge', 'index.md'),
      [
        '| ID | Marketplace | Plugin | Slug | Title | Edition | Path | Status |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
        '| KB-501 | spectastic | spectastic-concepts | 001-foundations | Foundations | 2026-01-01 | knowledge/spectastic-concepts/references/KB-501.md |  |',
        '',
      ].join('\n'),
    );
  }

  it('renders a bare KB id to its spectastic:// coordinate, no core, no specs/', () => {
    const cwd = freshProjectDir();
    seedRegisteredDoc(cwd);
    expect(existsSync(join(cwd, 'specs'))).toBe(false);

    const result = run(['id', 'KB-501'], cwd);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('spectastic://spectastic/corpus/spectastic-concepts/001-foundations');
  });

  it('renders an edition-pinned KB id with ?edition= appended', () => {
    const cwd = freshProjectDir();
    seedRegisteredDoc(cwd);

    const result = run(['id', 'KB-501@2026-01-01'], cwd);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(
      'spectastic://spectastic/corpus/spectastic-concepts/001-foundations?edition=2026-01-01',
    );
  });

  it('exits non-zero with no partial output for an unknown id', () => {
    const cwd = freshProjectDir();
    const result = run(['id', 'KB-9999'], cwd);
    expect(result.code).not.toBe(0);
  });

  it('exits non-zero with no partial output for a malformed id string (not a KB-NNNN shape)', () => {
    const cwd = freshProjectDir();
    const result = run(['id', 'not-a-kb-id'], cwd);
    expect(result.code).not.toBe(0);
    expect(result.stdout).not.toMatch(/^spectastic:\/\//);
  });

  it('reports absence — never a partial coordinate — for a document present in a pack but missing from the registry', () => {
    const cwd = freshProjectDir();
    // An index.md-only pack (pre-062 shape): the document resolves via
    // get(), but with no root registry there is no marketplace/plugin/slug
    // to compose a coordinate from.
    const packDir = join(cwd, 'knowledge', 'unregistered-pack');
    mkdirSync(join(packDir, 'references'), { recursive: true });
    writeFileSync(
      join(packDir, 'index.md'),
      [
        '| ID | Title | Description | Edition | Path |',
        '| --- | --- | --- | --- | --- |',
        '| KB-777 | Orphan doc | No registry row | 2026-01-01 | references/KB-777.md |',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(packDir, 'references', 'KB-777.md'),
      ['---', 'id: KB-777', 'edition: 2026-01-01', '---', '', '# Orphan doc', '', 'Body.', ''].join('\n'),
    );

    const result = run(['id', 'KB-777'], cwd);
    expect(result.code).not.toBe(0);
    expect(result.stdout).not.toMatch(/^spectastic:\/\//);
  });
});
