import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 2026-07-26 061-corpus-ingester T-400/T-401 (US4, seam-only per plan
 * D-007): `corpus source` registers through the same backbone `import`/
 * `interview` use, with its own origin/status shape — a fetched-URL +
 * retrieval-date + content-hash origin and a not-citable-until-confirmed
 * status. Secure-by-default (FR-011): no configured allowlist refuses every
 * origin outright, never a silent pass. The fetch-and-draft mechanics
 * themselves are deferred to TBD-corpus-sourcing/TBD-corpus-authority-
 * allowlist; this only proves the registration seam + the refusal default.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');

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
  return mkdtempSync(join(tmpdir(), `spectastic-corpus-source-${tag}-`));
}

describe('spectastic corpus source (061 T-400/T-401, FR-010/FR-011, plan D-007)', () => {
  it('refuses to register when no authority allowlist is configured (secure-by-default)', async () => {
    const dir = project('no-allowlist');
    const r = await runCLI(
      [
        'corpus',
        'source',
        'https://www.sec.gov/some-release',
        '--marketplace',
        'in-house',
        '--plugin',
        'ops-knowledge',
        '--slug',
        '001-sec-rule',
        '--title',
        'SEC rule excerpt',
        '--body',
        'Fetched text.',
      ],
      dir,
    );
    expect(r.code).not.toBe(0);
    expect(r.stderr.toLowerCase()).toContain('allowlist');
  });

  it('registers via the backbone with a fetched-URL origin and a not-citable-until-confirmed status, given an explicit --allow override', async () => {
    const dir = project('allowed');
    const r = await runCLI(
      [
        'corpus',
        'source',
        'https://www.sec.gov/some-release',
        '--marketplace',
        'in-house',
        '--plugin',
        'ops-knowledge',
        '--slug',
        '001-sec-rule',
        '--title',
        'SEC rule excerpt',
        '--body',
        'Fetched text.',
        '--allow',
        'www.sec.gov',
        '--date',
        '2026-07-26',
      ],
      dir,
    );
    expect(r.code, r.stdout + r.stderr).toBe(0);

    const doc = readFileSync(join(dir, 'knowledge', 'ops-knowledge', 'references', '001-sec-rule.md'), 'utf8');
    expect(doc).toContain('https://www.sec.gov/some-release');
    expect(doc).toContain('2026-07-26');
    expect(doc).toContain('status: not-citable-until-confirmed');
    expect(doc).toContain('content-hash: sha256:');
  });

  it('prints a notice that the sourcing mechanics and allowlist are deferred', async () => {
    const dir = project('notice');
    const r = await runCLI(
      [
        'corpus',
        'source',
        'https://www.sec.gov/some-release',
        '--marketplace',
        'in-house',
        '--plugin',
        'ops-knowledge',
        '--slug',
        '001-sec-rule',
        '--title',
        'SEC rule excerpt',
        '--body',
        'Fetched text.',
        '--allow',
        'www.sec.gov',
      ],
      dir,
    );
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('TBD-corpus-sourcing');
    expect(r.stdout).toContain('TBD-corpus-authority-allowlist');
  });
});
