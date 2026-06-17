import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * T-112 of specs/013-core-propose/tasks.html. CLI integration tests for
 * `spectastic propose`. AI-heavy verb; tests cover the deterministic
 * surface (arg validation, --adversarial / --no-adversarial flag
 * parsing, key-missing path proving the wiring reaches AI).
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function runCLI(args: string[], cwd: string, extraEnv: Record<string, string> = {}): Promise<RunResult> {
  return new Promise((resolveFn) => {
    const child = spawn('node', [CLI, ...args], { cwd, env: { ...process.env, ...extraEnv } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (code) => resolveFn({ stdout, stderr, code: code ?? 0 }));
  });
}

describe('CLI integration: propose (T-112)', () => {
  it('reaches AI layer with both required args (proves CLI wiring)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-propose-nokey-'));

    const r = await runCLI(
      ['propose', '001-foo', 'fake change description'],
      cwd,
      { ANTHROPIC_API_KEY: '' },
    );
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('ANTHROPIC_API_KEY');
  });

  it('--adversarial flag accepted by commander', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-propose-adv-'));

    const r = await runCLI(
      ['propose', '001-foo', 'desc', '--adversarial'],
      cwd,
      { ANTHROPIC_API_KEY: '' },
    );
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('ANTHROPIC_API_KEY');
  });

  it('--no-adversarial flag accepted by commander', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-propose-noadv-'));

    const r = await runCLI(
      ['propose', '001-foo', 'desc', '--no-adversarial'],
      cwd,
      { ANTHROPIC_API_KEY: '' },
    );
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('ANTHROPIC_API_KEY');
  });

  it('missing required args fails (commander usage error)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-propose-noargs-'));

    const r = await runCLI(['propose'], cwd);
    expect(r.code).not.toBe(0);
    expect(r.stderr.toLowerCase()).toContain('argument');
  });

  it('happy path with SPECTASTIC_AI_STUB triggers adversarial pass via removed-delta heuristic (T-112)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-propose-stub-'));
    const specId = 'foo-bar';
    const { mkdirSync, writeFileSync, readFileSync, readdirSync } = await import('node:fs');
    mkdirSync(`${cwd}/specs/${specId}`, { recursive: true });
    writeFileSync(
      `${cwd}/specs/${specId}/spec.html`,
      `<!doctype html><html><body><main>
<header><spec-meta></spec-meta></header>
<section><h2>Reqs</h2>
  <spec-requirement id="FR-001" priority="must"><p>Do the thing.</p></spec-requirement>
  <spec-requirement id="FR-002" priority="must"><p>Do the other thing.</p></spec-requirement>
</section>
</main></body></html>`,
    );
    const scriptPath = resolve(here, 'fixtures', 'propose-script.json');

    const r = await runCLI(
      ['propose', specId, 'remove FR-002'],
      cwd,
      { SPECTASTIC_AI_STUB: scriptPath, ANTHROPIC_API_KEY: '' },
    );

    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('1 deltas');
    // Adversarial pass fired (removed-delta + must-tier touched) → 3 risks identified.
    expect(r.stdout).toContain('3 risks identified');

    // Locate the generated proposal in specs/<id>/changes/<date>-<slug>/
    const changesDir = `${cwd}/specs/${specId}/changes`;
    const slugDirs = readdirSync(changesDir);
    expect(slugDirs).toHaveLength(1);
    const proposalPath = `${changesDir}/${slugDirs[0]}/proposal.html`;
    const proposal = readFileSync(proposalPath, 'utf8');

    expect(proposal).toContain('<spec-delta op="removed" target="FR-002">');
    // All three risks landed as <spec-risk status="identified"> per 013 D-005.
    expect(proposal).toContain('<spec-risk');
    expect(proposal).toContain('status="identified"');
    expect(proposal).toContain('FR-002');
  });
});
