import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * SC-004 of specs/118-verdict-explain: with both `--explain` and `--teach`, the
 * Socratic question appears AFTER the explanation. This ordering lives in the
 * CLI action (the kernel renderers are pure and order-agnostic), so the honest
 * instrument is a real spawn of the binary — matching SC-004's "Observed at:
 * packages/cli integration run with both flags".
 *
 * Requires a fresh CLI build (`pnpm --filter @spectastic/cli build`).
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
    const child = spawn('node', [CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.on('close', (code) => resolveFn({ stdout, stderr, code: code ?? 0 }));
  });
}

/** A minimal init'd project: one accepted content-rule decision + a changed file that violates it. */
function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'verdict-explain-'));
  mkdirSync(join(dir, 'specs', '002-downstream'), { recursive: true });
  writeFileSync(
    join(dir, 'specs', '002-downstream', 'design.html'),
    `<!doctype html><html><body>
      <spec-decision id="D-007" status="accepted" posture="block">
        <h4>D-007 · ADR-0007 — only the persistence adapter touches the data store</h4>
        <p>Context. The emission guarantee is only as strong as the boundary.</p>
        <spec-scope><spec-path>src/**/persistence/**</spec-path></spec-scope>
        <spec-reason>Every position change must emit PositionChanged so the audit hooks fire.</spec-reason>
        <spec-enforcement>
          <spec-rule tool="native-content" id="no_direct_positions_write"
            pattern="UPDATE\\s+positions" allowed-in="src/**/persistence/**"></spec-rule>
        </spec-enforcement>
      </spec-decision>
    </body></html>`,
  );
  mkdirSync(join(dir, 'src', 'recon'), { recursive: true });
  writeFileSync(join(dir, 'src', 'recon', 'Job.java'), 'void run() {\n  db.exec("UPDATE positions SET qty=0");\n}\n');
  return dir;
}

describe('verdict --explain --teach compose (SC-004)', () => {
  it('renders the explanation, then the teaching question after it', async () => {
    const dir = fixture();
    const r = await runCLI(
      ['verdict', '--changed', 'src/recon/Job.java', '--explain', '--teach', '--out', '.spectastic/verdict.json'],
      dir,
    );
    expect(r.code).toBe(1); // a violation → non-zero
    // The explanation block (118) renders.
    expect(r.stdout).toMatch(/Offending/);
    expect(r.stdout).toMatch(/Sanctioned path/);
    expect(r.stdout).toMatch(/ADR-0007/);
    // The teaching block (117) renders.
    expect(r.stdout).toMatch(/Teaching follow-up/);
    // Ordering: the question appears AFTER the explanation.
    expect(r.stdout.indexOf('Sanctioned path')).toBeLessThan(r.stdout.indexOf('Teaching follow-up'));
  });
});
