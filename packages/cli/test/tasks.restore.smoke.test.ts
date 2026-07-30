import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * T-015 of spec 024-explore-restore. CLI integration for the `tasks --restore`
 * trigger (FR-001 / SC-001). A spawned subprocess has no TTY, so it exercises the
 * non-interactive branches: --restore forces restore (and refuses a non-graduated
 * id); the no-flag-on-graduated case refuses-with-hint rather than guess the shape.
 * Restore generation itself is unit-tested in core; here we prove the wiring + the
 * never-silent-wrong-shape guarantee.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');
const STUB = resolve(here, 'fixtures', 'tasks-restore-script.json');

const SPEC = `<!doctype html><html lang="en"><body><main>
<header><p class="small-caps">Specification · 019-demo</p><h1>Demo</h1>
<spec-meta><b>Spec ID</b><span>019-demo</span></spec-meta></header>
<section id="requirements">
<spec-requirement id="FR-001" priority="must"><p>The system <spec-rule>MUST</spec-rule> do A.</p></spec-requirement>
<spec-requirement id="FR-002" priority="must"><p>The system <spec-rule>MUST</spec-rule> do B.</p></spec-requirement>
</section>
<section id="success">
<spec-requirement id="SC-001" priority="must"><p>A works.</p></spec-requirement>
</section></main></body></html>`;
const PLAN = `<!doctype html><html lang="en"><body><main><h1>plan</h1></main></body></html>`;

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function runCLI(args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolveFn) => {
    const child = spawn('node', [CLI, ...args], {
      cwd,
      env: { ...process.env, SPECTASTIC_AI_STUB: STUB },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.on('close', (code) => resolveFn({ stdout, stderr, code: code ?? 0 }));
  });
}

/** A tmp project with a graduated exploration: spec+plan + archived marker. */
function graduatedProject(classify: 'spike' | 'tracer-bullet'): string {
  const cwd = mkdtempSync(join(tmpdir(), 'spectastic-restore-'));
  mkdirSync(join(cwd, 'specs', '019-demo'), { recursive: true });
  writeFileSync(join(cwd, 'specs', '019-demo', 'spec.html'), SPEC);
  writeFileSync(join(cwd, 'specs', '019-demo', 'plan.html'), PLAN);
  mkdirSync(join(cwd, 'explorations', 'archive', '019-demo'), {
    recursive: true,
  });
  writeFileSync(
    join(cwd, 'explorations', 'archive', '019-demo', 'quarantine.json'),
    JSON.stringify({ id: '019-demo', status: 'graduated', classify }),
  );
  return cwd;
}

describe('CLI integration: tasks --restore (T-015, 024-explore-restore)', () => {
  it('--restore forces restore tasks and banners the classification', async () => {
    const cwd = graduatedProject('tracer-bullet');
    const r = await runCLI(['tasks', '019-demo', '--restore'], cwd);
    expect(r.code).toBe(0);
    const html = readFileSync(join(cwd, 'specs', '019-demo', 'tasks.html'), 'utf8');
    expect(html).toMatch(/Restore tasks · tracer-bullet/);
    expect(html).toContain('explorations/archive/019-demo');
  });

  it('no flag on a graduated spec refuses-with-hint (non-TTY) — never a silent shape (SC-001)', async () => {
    const cwd = graduatedProject('tracer-bullet');
    const r = await runCLI(['tasks', '019-demo'], cwd);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/graduated as tracer-bullet/);
    expect(r.stderr).toMatch(/--restore/);
  });

  it('--restore on a non-graduated id refuses (nothing to restore)', async () => {
    const cwd = graduatedProject('spike');
    const r = await runCLI(['tasks', '999-nope', '--restore'], cwd);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/not a graduated exploration/);
  });
});
