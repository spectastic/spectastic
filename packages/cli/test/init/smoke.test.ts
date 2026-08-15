import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SCAFFOLD_TREE_FILE_COUNT } from '../../src/commands/init/plan.js';

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', '..', 'bin', 'spectastic');

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
  durationMs: number;
}

async function runCLI(args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolveFn) => {
    const t0 = performance.now();
    const child = spawn('node', [CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (code) => {
      resolveFn({
        stdout,
        stderr,
        code: code ?? 0,
        durationMs: performance.now() - t0,
      });
    });
  });
}

function listFilesRecursive(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...listFilesRecursive(full, base));
    } else if (s.isFile()) {
      out.push(full.slice(base.length + 1));
    }
  }
  return out;
}

/**
 * T-102 of specs/003-init-node-port/tasks.html. Smoke integration:
 * spawn the compiled CLI in an empty tmp dir and assert the 19-file
 * lifecycle structure lands with exit 0 and the right summary shape.
 *
 * Implements FR-001, FR-002, FR-006, FR-007, NFR-001 (perf check).
 */
describe('init: smoke (T-102)', () => {
  it('binary exists (build + prebuild must run first)', () => {
    expect(
      existsSync(resolve(here, '..', '..', 'dist', 'index.js')),
      'expected dist/index.js; run pnpm --filter @spectastic/cli build first',
    ).toBe(true);
  });

  it('empty dir → the full scaffold tree, exit 0, summary present (FR-001, FR-002, FR-006, FR-007)', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'spectastic-init-smoke-'));
    const r = await runCLI(['init'], tmpDir);
    expect(r.code, `stderr: ${r.stderr}\nstdout: ${r.stdout}`).toBe(0);

    const files = listFilesRecursive(tmpDir).sort();
    // The ON-DISK tree: bundle files + the .gitignore + spectastic.json init
    // generates itself (063-corpus-discoverability FR-001). Single-sourced
    // so it can't drift from SC-001 again (T-1005).
    expect(files.length).toBe(SCAFFOLD_TREE_FILE_COUNT);
    expect(files).toContain('.claude/commands/spectastic.spec.md');
    expect(files).toContain('assets/theme-boot.js');
    expect(files).toContain('assets/favicon.svg');
    expect(files).toContain('.claude/commands/spectastic.apply.md');
    expect(files).toContain('.claude/commands/spectastic.implement.md');
    expect(files.filter((f) => f.startsWith('.claude/commands/')).length).toBe(8);
    // 003 FR-002: the three subagent definitions, asserted BY NAME. A count
    // would pass if three unrelated files landed in .claude/agents/, and the
    // point of installing them is that these three specific pins are present
    // — `implement --model opus` (044 FR-003) is unsatisfiable without
    // spectastic-impl-task in particular.
    expect(files).toContain('.claude/agents/spectastic-classifier.md');
    expect(files).toContain('.claude/agents/spectastic-critic.md');
    expect(files).toContain('.claude/agents/spectastic-impl-task.md');
    expect(files.filter((f) => f.startsWith('.claude/agents/')).length).toBe(3);
    expect(files).toContain('assets/spec.css');
    expect(files).toContain('assets/spec.js');
    expect(files).toContain('templates/principles.html');
    expect(files).toContain('templates/spec.html');
    expect(files).toContain('templates/inbox.html');
    expect(files).toContain('spectastic.json');

    expect(r.stdout).toContain('spectastic init — summary');
    expect(r.stdout).toContain('wrote');
    expect(r.stdout).toContain('Next step:');
  });

  it('completes in <500ms (NFR-001)', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'spectastic-init-perf-'));
    const r = await runCLI(['init'], tmpDir);
    expect(r.code).toBe(0);
    expect(r.durationMs, `init took ${r.durationMs.toFixed(0)}ms`).toBeLessThan(500);
  });

  it('existing file in non-TTY without --force → exit 2 (FR-005)', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'spectastic-init-conflict-'));
    const assetsDir = join(tmpDir, 'assets');
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(join(assetsDir, 'spec.css'), '/* user content */');

    const r = await runCLI(['init'], tmpDir);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('--force');
  });

  it('existing file + --force → exit 0, file overwritten (FR-004, T-301)', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'spectastic-init-force-'));
    const assetsDir = join(tmpDir, 'assets');
    mkdirSync(assetsDir, { recursive: true });
    const conflictPath = join(assetsDir, 'spec.css');
    writeFileSync(conflictPath, '/* user content — should be overwritten */');

    const r = await runCLI(['init', '--force'], tmpDir);
    expect(r.code, `stderr: ${r.stderr}\nstdout: ${r.stdout}`).toBe(0);
    // Content should now be the bundle's spec.css, not the user content.
    const after = require('node:fs').readFileSync(conflictPath, 'utf8');
    expect(after).not.toContain('user content');
    expect(after.length).toBeGreaterThan(1000); // spec.css is ~50KB
  });
});
