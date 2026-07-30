import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Integration tests for `init --profile` (spec 041, T-100 / T-200 / T-300 / T-901).
 * Spawns the real binary in temp dirs — needs a fresh build (prebuild copies
 * profiles.json into _bundled/). Run `pnpm --filter @spectastic/cli build` first.
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
    // stdin is a pipe (not a TTY) → exercises the non-interactive path.
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

const tmp = (tag: string) => mkdtempSync(join(tmpdir(), `spectastic-prof-${tag}-`));

describe('init --profile: US1 greenfield (SC-001)', () => {
  it('standard writes the three composed artifacts + marker', async () => {
    const dir = tmp('std');
    const r = await runCLI(['init', '--profile', 'standard'], dir);
    expect(r.code, r.stderr).toBe(0);

    expect(existsSync(join(dir, 'principles.html'))).toBe(true);
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(true);

    const principles = readFileSync(join(dir, 'principles.html'), 'utf8');
    expect(principles).toMatch(/id="P-1"/);
    const agents = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
    expect(agents.split('\n').length).toBeLessThanOrEqual(150);
    expect(agents).toContain('# AGENTS.md');
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toContain('AGENTS.md');

    const marker = JSON.parse(readFileSync(join(dir, '.spectastic', 'profile.json'), 'utf8'));
    expect(marker.profile).toBe('standard');
  });
});

describe('init --profile: US2 dial + validation (SC-002, FR-001)', () => {
  it('the four profiles yield materially different principles', async () => {
    const bodies: Record<string, string> = {};
    for (const name of ['lean', 'standard', 'verified', 'enterprise']) {
      const dir = tmp(name);
      const r = await runCLI(['init', '--profile', name], dir);
      expect(r.code, r.stderr).toBe(0);
      bodies[name] = readFileSync(join(dir, 'principles.html'), 'utf8');
    }
    // Pairwise distinct, and rigor grows: verified has a principle lean omits.
    expect(bodies.lean).not.toBe(bodies.verified);
    expect(bodies.verified).toContain('Done means verified');
    expect(bodies.lean).not.toContain('Done means verified');
    expect(bodies.enterprise).toContain('Ship dark by default');
  });

  it('an unknown profile exits 2 listing the valid names (FR-001)', async () => {
    const dir = tmp('bad');
    const r = await runCLI(['init', '--profile', 'pro'], dir);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('lean, standard, verified, enterprise');
    expect(existsSync(join(dir, 'principles.html'))).toBe(false);
  });
});

describe('init --profile: US3 brownfield (SC-003, SC-004)', () => {
  it('additive upgrade lean→verified preserves user edits and adds principles', async () => {
    const dir = tmp('upgrade');
    expect((await runCLI(['init', '--profile', 'lean'], dir)).code).toBe(0);

    // A user edit above the sentinel must survive the upgrade.
    const p = join(dir, 'principles.html');
    writeFileSync(p, readFileSync(p, 'utf8').replace('<h1>', '<!-- KEEP --><h1>'), 'utf8');

    const r = await runCLI(['init', '--profile', 'verified', '--force'], dir);
    expect(r.code, r.stderr).toBe(0);

    const after = readFileSync(p, 'utf8');
    expect(after).toContain('<!-- KEEP -->'); // SC-003: edit survived
    expect(after).toContain('Done means verified'); // SC-004: verified principle added
    // Contiguous P-1..P-N after the additive lean→verified upgrade (count-agnostic).
    const ids = [...after.matchAll(/id="P-(\d+)"/g)].map((m) => Number(m[1]));
    expect(ids).toEqual(ids.map((_, i) => i + 1));
    expect(ids.length).toBeGreaterThanOrEqual(7);

    const marker = JSON.parse(readFileSync(join(dir, '.spectastic', 'profile.json'), 'utf8'));
    expect(marker.profile).toBe('verified');
  });
});

describe('init --profile: US2 non-TTY backward compat (NFR-001)', () => {
  it('no --profile + non-TTY installs the lifecycle only, no profile artifacts', async () => {
    const dir = tmp('plain');
    const r = await runCLI(['init'], dir);
    expect(r.code, r.stderr).toBe(0);
    expect(existsSync(join(dir, '.claude', 'commands'))).toBe(true); // lifecycle installed
    expect(existsSync(join(dir, 'principles.html'))).toBe(false); // no profile scaffolding
    expect(existsSync(join(dir, '.spectastic'))).toBe(false); // no marker
    // 031 T-001: --tools is discoverable — a non-interactive run still surfaces the tip.
    expect(r.stdout).toMatch(/init --tools/);
  });
});
