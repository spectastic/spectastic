import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Integration tests for spec 043 (init base .gitignore + `spectastic gitignore
 * --stack`). Spawns the real binary; needs a fresh build.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');

async function runCLI(args: string[], cwd: string): Promise<{ stdout: string; code: number }> {
  return new Promise((resolveFn) => {
    const child = spawn('node', [CLI, ...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stdin.end();
    child.on('close', (code) => resolveFn({ stdout, code: code ?? 0 }));
  });
}

const tmp = (t: string) => mkdtempSync(join(tmpdir(), `spectastic-gi-${t}-`));

describe('init: base .gitignore (US1, SC-001)', () => {
  it('writes a spectastic block ignoring ephemera, not the marker', async () => {
    const dir = tmp('base');
    const r = await runCLI(['init'], dir);
    expect(r.code, r.stdout).toBe(0);
    const gi = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(gi).toContain('.spectastic/courses/');
    expect(gi).not.toMatch(/^\.spectastic\/\s*$/m); // not the whole dir → marker stays trackable
  });

  it('--no-gitignore skips the write', async () => {
    const dir = tmp('none');
    await runCLI(['init', '--no-gitignore'], dir);
    expect(existsSync(join(dir, '.gitignore'))).toBe(false);
  });
});

describe('gitignore --stack (US2, SC-002)', () => {
  it('appends the detected ecosystem ignores', async () => {
    const dir = tmp('stack');
    await runCLI(['init'], dir);
    writeFileSync(join(dir, 'pyproject.toml'), '[tool.ruff]\n', 'utf8');
    writeFileSync(join(dir, 'tsconfig.json'), '{}', 'utf8');
    const r = await runCLI(['gitignore', '--stack'], dir);
    expect(r.code).toBe(0);
    const gi = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(gi).toContain('__pycache__/');
    expect(gi).toContain('node_modules/');
  });
});

describe('gitignore brownfield (US3, SC-003)', () => {
  it('preserves user lines and is idempotent on re-run', async () => {
    const dir = tmp('brown');
    writeFileSync(join(dir, '.gitignore'), '# mine\n*.secret\nbuild-out/\n', 'utf8');
    await runCLI(['gitignore'], dir);
    const first = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(first).toContain('*.secret');
    expect(first).toContain('build-out/');
    expect(first).toContain('.spectastic/courses/');

    await runCLI(['gitignore'], dir);
    const second = readFileSync(join(dir, '.gitignore'), 'utf8');
    expect(second).toBe(first); // idempotent
  });
});
