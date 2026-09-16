import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * REQ-FORMAT-010 of specs/091-artifact-format, end-to-end (T-304): the CLI
 * reports an artifact whose stylesheet does not resolve, and exits non-zero.
 *
 * The reference is PLANTED rather than pointed at a fixture in the estate,
 * deliberately. A fixture that is broken on purpose is one tidy-up away from
 * being repaired by someone who reasonably assumes it is a mistake — at which
 * point this test passes forever while proving nothing. This is the same
 * artifact shape, at the same depth, that produced the defect: an artifact two
 * levels below the project root reaching `../assets/` where the file is two
 * levels up.
 *
 * Requires a fresh CLI build (`pnpm --filter @spectastic/cli build`).
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');

async function runCLI(args: string[], cwd: string): Promise<{ stdout: string; code: number }> {
  return new Promise((resolveFn) => {
    const child = spawn('node', [CLI, ...args], { cwd });
    let stdout = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.on('close', (code) => resolveFn({ stdout, code: code ?? 0 }));
  });
}

/**
 * A project whose one artifact references its stylesheet at `depth`.
 * `../../assets/spec.css` is correct from `specs/<id>/`; `../assets/spec.css`
 * is the real defect, one level short.
 */
function fixture(href: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'asset-resolve-'));
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'assets', 'spec.css'), '/* present */');
  mkdirSync(join(dir, 'specs', '001-fixture'), { recursive: true });
  writeFileSync(
    join(dir, 'specs', '001-fixture', 'spec.html'),
    [
      '<!doctype html>',
      '<html lang="en"><head><meta charset="utf-8">',
      '<title>Fixture · Specification</title>',
      `<link rel="stylesheet" href="${href}">`,
      '</head><body><main><p>An artifact.</p></main></body></html>',
      '',
    ].join('\n'),
  );
  return dir;
}

describe('REQ-FORMAT-010 · the CLI reports an asset reference that does not resolve', () => {
  it('reports the broken reference and exits non-zero', async () => {
    const dir = fixture('../assets/spec.css'); // one `../` short — the real defect
    const { stdout, code } = await runCLI(['validate', 'specs/**/*.html'], dir);

    expect(stdout).toMatch(/asset-resolve/);
    expect(stdout).toMatch(/no such file/i);
    expect(stdout).toMatch(/spec\.css/);
    expect(code).not.toBe(0);
  });

  it('stays silent, and exits zero, when the same reference resolves', async () => {
    const dir = fixture('../../assets/spec.css'); // correct depth
    const { stdout, code } = await runCLI(['validate', 'specs/**/*.html'], dir);

    expect(stdout).not.toMatch(/asset-resolve/);
    expect(code).toBe(0);
  });

  it('names the artifact and the line, so the finding is actionable', async () => {
    const dir = fixture('../assets/spec.css');
    const { stdout } = await runCLI(['validate', 'specs/**/*.html'], dir);

    expect(stdout).toMatch(/specs\/001-fixture\/spec\.html/);
    // The <link> is on line 4 of the artifact written above.
    expect(stdout).toMatch(/\b4:/);
  });
});
