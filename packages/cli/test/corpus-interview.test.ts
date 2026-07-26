import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 2026-07-26 061-corpus-ingester T-300 (US3, seam-only per plan D-007):
 * `corpus interview` registers through the same backbone `import` uses, with
 * its own origin/status shape — an `interview: <role>, <date>` origin and a
 * not-citable-until-signed-off status. The interview discipline itself
 * (running the actual elicitation) is deferred to TBD-corpus-interview; this
 * only proves the registration seam.
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
    const child = spawn('node', [CLI, ...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.stdin.end();
    child.on('close', (code) => resolveFn({ stdout, stderr, code: code ?? 0 }));
  });
}

function project(tag: string): string {
  return mkdtempSync(join(tmpdir(), `spectastic-corpus-interview-${tag}-`));
}

describe('spectastic corpus interview (061 T-300, FR-010, plan D-007)', () => {
  it('registers via the backbone with an interview origin and a not-citable-until-signed-off status', async () => {
    const dir = project('basic');

    const r = await runCLI(
      [
        'corpus',
        'interview',
        'settlement-desk-lead',
        '--marketplace',
        'in-house',
        '--plugin',
        'ops-knowledge',
        '--slug',
        '001-manual-override-window',
        '--title',
        'Manual override window',
        '--body',
        'The desk may manually override a settlement within a 30 minute window.',
        '--date',
        '2026-07-26',
      ],
      dir,
    );
    expect(r.code, r.stdout + r.stderr).toBe(0);

    const registry = readFileSync(join(dir, 'knowledge', 'index.md'), 'utf8');
    expect(registry).toContain('001-manual-override-window');
    expect(registry).toContain('in-house');
    expect(registry).toContain('ops-knowledge');

    const doc = readFileSync(
      join(dir, 'knowledge', 'ops-knowledge', 'references', '001-manual-override-window.md'),
      'utf8',
    );
    expect(doc).toContain('origin: "interview: settlement-desk-lead, 2026-07-26"');
    expect(doc).toContain('status: not-citable-until-signed-off');
    expect(doc).toContain('manually override a settlement');
  });

  it('prints a notice that the interview discipline itself is deferred', async () => {
    const dir = project('notice');
    const r = await runCLI(
      [
        'corpus',
        'interview',
        'ops-lead',
        '--marketplace',
        'in-house',
        '--plugin',
        'ops-knowledge',
        '--slug',
        '002-second-fact',
        '--title',
        'Second fact',
        '--body',
        'Body text.',
      ],
      dir,
    );
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('TBD-corpus-interview');
  });
});
