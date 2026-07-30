import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 067-spec-project-identity T-101/T-102: `spectastic init` persists an
 * owner-qualified `project` identity to `spectastic.json` ONLY when the git
 * remote confidently resolves one (FR-002, plan D-002) — the common
 * fresh-repo case (no remote yet) leaves `project` absent (provisional)
 * rather than locking in a federation-fragile bare-dir-name default. Never
 * overwrites an existing value. Mirrors `corpus-config.test.ts`'s exact
 * CLI-subprocess-in-a-temp-dir shape.
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
  return mkdtempSync(join(tmpdir(), `spectastic-init-project-${tag}-`));
}

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function readConfig(dir: string): { project?: string } {
  return JSON.parse(readFileSync(join(dir, 'spectastic.json'), 'utf8')) as {
    project?: string;
  };
}

describe('spectastic init — project identity (067 T-101/T-102, FR-002)', () => {
  it('persists an owner-qualified project when the remote confidently resolves', async () => {
    const dir = project('with-remote');
    git(dir, 'init', '-q');
    git(dir, 'remote', 'add', 'origin', 'https://github.com/acme/widget.git');

    const r = await runCLI(['init'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);

    expect(readConfig(dir).project).toBe('acme/widget');
  });

  it('leaves project absent — provisional — when there is no remote (the common fresh-repo case)', async () => {
    const dir = project('no-remote');
    git(dir, 'init', '-q'); // a repo, but no remote yet — the typical `git init` -> `spectastic init` order

    const r = await runCLI(['init'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);

    expect(readConfig(dir).project).toBeUndefined();
  });

  it('leaves project absent when the directory is not a git repo at all', async () => {
    const dir = project('no-git');

    const r = await runCLI(['init'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);

    expect(readConfig(dir).project).toBeUndefined();
  });

  it('never overwrites an existing project value, even with a confident remote present', async () => {
    const dir = project('existing-value');
    git(dir, 'init', '-q');
    git(dir, 'remote', 'add', 'origin', 'https://github.com/acme/widget.git');
    writeFileSync(join(dir, 'spectastic.json'), JSON.stringify({ project: 'hand-set/identity' }));

    const r = await runCLI(['init'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);

    expect(readConfig(dir).project).toBe('hand-set/identity');
  });

  it('firms up a provisional identity on a later re-run once a remote exists', async () => {
    const dir = project('firm-up');
    git(dir, 'init', '-q');

    const first = await runCLI(['init'], dir);
    expect(first.code, first.stdout + first.stderr).toBe(0);
    expect(readConfig(dir).project).toBeUndefined();

    git(dir, 'remote', 'add', 'origin', 'https://github.com/acme/widget.git');
    const second = await runCLI(['init', '--force'], dir);
    expect(second.code, second.stdout + second.stderr).toBe(0);
    expect(readConfig(dir).project).toBe('acme/widget');
  });

  it('does not fabricate a bare directory-name project — basename(dir) never appears unless it IS the owner/repo', async () => {
    const dir = project('sanity');
    git(dir, 'init', '-q');
    const r = await runCLI(['init'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    // No remote -> absent. Confirms the old corpus-config precedent (basename
    // default) is NOT reused for `project` (FR-002's whole point).
    expect(readConfig(dir).project).toBeUndefined();
    expect(basename(dir)).toBeTruthy(); // sanity: dir really has a name to have fabricated
  });

  // 067 T-900 (plan §8 R3): a real bug caught by end-to-end testing — writeCorpusConfig
  // used to write an EXPLICIT corpus.marketplace = basename(cwd) unconditionally, which
  // (explicit marketplace always winning in resolveCorpusConfig's precedence) permanently
  // shadowed a same-run project identity, defeating FR-006's unification entirely.
  it('a fresh init with a confident remote unifies corpus.marketplace with project (FR-006)', async () => {
    const dir = project('unify');
    git(dir, 'init', '-q');
    git(dir, 'remote', 'add', 'origin', 'https://github.com/acme/widget.git');

    const r = await runCLI(['init'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);

    const config = JSON.parse(readFileSync(join(dir, 'spectastic.json'), 'utf8')) as {
      project?: string;
      corpus?: { marketplace?: string };
    };
    expect(config.project).toBe('acme/widget');
    expect(config.corpus?.marketplace).toBe('acme/widget'); // unified, not basename(dir)
  });

  it('a fresh init with no remote still writes corpus.marketplace = basename(dir) (unchanged precedent)', async () => {
    const dir = project('unify-no-remote');
    git(dir, 'init', '-q');

    const r = await runCLI(['init'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);

    const config = JSON.parse(readFileSync(join(dir, 'spectastic.json'), 'utf8')) as {
      project?: string;
      corpus?: { marketplace?: string };
    };
    expect(config.project).toBeUndefined();
    expect(config.corpus?.marketplace).toBe(basename(dir));
  });
});
