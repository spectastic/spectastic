import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Integration test for the FR-004 quantified-NFR CLI scan (spec
 * 047-slo-nfr-artifact, US2, SC-002). Spawns the real `spectastic validate`
 * binary against a temp project with a written `.spectastic/profile.json`
 * marker, mirroring `enforce.integration.test.ts`'s harness. Needs a fresh
 * build (`pnpm --filter @spectastic/cli build`) to pick up the scan.
 *
 * Written before scanQuantifiedNfr is wired (T-201) — failing (exit 0 when
 * it should be 1) until T-210/T-211 land.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');
const RULE = 'quantified-nfr-required';

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

const UNQUANTIFIED_SPEC = `<!doctype html>
<html><head><meta charset="utf-8"><title>Fixture · Specification</title></head>
<body><main>
<spec-requirement id="NFR-001" priority="must"><p>The system must be fast.</p></spec-requirement>
</main></body></html>
`;

const QUANTIFIED_SPEC = `<!doctype html>
<html><head><meta charset="utf-8"><title>Fixture · Specification</title></head>
<body><main>
<spec-requirement id="NFR-001" priority="must"><p>p95 latency &lt; 200 ms.</p></spec-requirement>
</main></body></html>
`;

function project(tag: string): string {
  return mkdtempSync(join(tmpdir(), `spectastic-quantified-nfr-${tag}-`));
}

function withMarker(dir: string, profile: string): void {
  mkdirSync(join(dir, '.spectastic'), { recursive: true });
  writeFileSync(join(dir, '.spectastic', 'profile.json'), JSON.stringify({ profile, schema: 1 }), 'utf8');
}

describe('validate: US2 a verified NFR must be quantified (SC-002)', () => {
  it('verified + an unquantified NFR → exit 1 naming the finding', async () => {
    const dir = project('unquantified-verified');
    withMarker(dir, 'verified');
    writeFileSync(join(dir, 'spec.html'), UNQUANTIFIED_SPEC, 'utf8');
    const r = await runCLI(['validate', 'spec.html'], dir);
    expect(r.code, r.stdout).toBe(1);
    expect(r.stdout).toContain(RULE);
    expect(r.stdout).toMatch(/NFR-001/);
  });

  it('verified + a quantified NFR → exit 0', async () => {
    const dir = project('quantified-verified');
    withMarker(dir, 'verified');
    writeFileSync(join(dir, 'spec.html'), QUANTIFIED_SPEC, 'utf8');
    const r = await runCLI(['validate', 'spec.html'], dir);
    expect(r.code, r.stdout).toBe(0);
  });

  it('standard (below verified) + an unquantified NFR → exit 0 (not gated)', async () => {
    const dir = project('unquantified-standard');
    withMarker(dir, 'standard');
    writeFileSync(join(dir, 'spec.html'), UNQUANTIFIED_SPEC, 'utf8');
    const r = await runCLI(['validate', 'spec.html'], dir);
    expect(r.code, r.stdout).toBe(0);
  });

  it('no profile marker + an unquantified NFR → exit 0 (no-op)', async () => {
    const dir = project('unquantified-no-marker');
    writeFileSync(join(dir, 'spec.html'), UNQUANTIFIED_SPEC, 'utf8');
    const r = await runCLI(['validate', 'spec.html'], dir);
    expect(r.code, r.stdout).toBe(0);
  });
});
