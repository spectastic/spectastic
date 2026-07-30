import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 063-corpus-discoverability T-101/T-120: `spectastic init` writes a `corpus`
 * section to `spectastic.json` (FR-001, SC-001) — the marketplace name
 * defaulting to the repo directory name, the root defaulting to `knowledge`
 * — via a create-or-merge writer that never touches an existing section
 * (an existing `corpus` section, or an unrelated section like `git`, both
 * survive untouched).
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', '..', 'bin', 'spectastic');

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function runCLI(args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolveFn) => {
    const child = spawn('node', [CLI, ...args], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.stdin.end();
    child.on('close', (code) => resolveFn({ stdout, stderr, code: code ?? 0 }));
  });
}

function project(tag: string): string {
  return mkdtempSync(join(tmpdir(), `spectastic-init-corpus-${tag}-`));
}

describe('spectastic init — corpus config (063 T-101/T-120, FR-001, SC-001)', () => {
  it('a fresh init writes corpus.marketplace = repo dir name, corpus.root = knowledge', async () => {
    const dir = project('fresh');
    const r = await runCLI(['init'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);

    const config = JSON.parse(readFileSync(join(dir, 'spectastic.json'), 'utf8')) as {
      corpus?: { marketplace?: string; root?: string };
    };
    expect(config.corpus).toEqual({
      marketplace: basename(dir),
      root: 'knowledge',
    });
    expect(r.stdout).toContain('spectastic.json corpus config');
  });

  it('preserves an existing unrelated section (git) and adds corpus alongside it', async () => {
    const dir = project('existing-git');
    writeFileSync(join(dir, 'spectastic.json'), JSON.stringify({ git: { auto: 'commit', trailers: 'on' } }));

    const r = await runCLI(['init'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);

    const config = JSON.parse(readFileSync(join(dir, 'spectastic.json'), 'utf8')) as {
      git?: { auto?: string; trailers?: string };
      corpus?: { marketplace?: string; root?: string };
    };
    expect(config.git).toEqual({ auto: 'commit', trailers: 'on' });
    expect(config.corpus).toEqual({
      marketplace: basename(dir),
      root: 'knowledge',
    });
  });

  it('never overwrites an already-configured corpus section', async () => {
    const dir = project('existing-corpus');
    writeFileSync(
      join(dir, 'spectastic.json'),
      JSON.stringify({
        corpus: { marketplace: 'acme', root: 'domain-knowledge' },
      }),
    );

    const r = await runCLI(['init'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);

    const config = JSON.parse(readFileSync(join(dir, 'spectastic.json'), 'utf8')) as {
      corpus?: { marketplace?: string; root?: string };
    };
    expect(config.corpus).toEqual({
      marketplace: 'acme',
      root: 'domain-knowledge',
    });
    expect(r.stdout).not.toContain('spectastic.json corpus config');
  });
});
