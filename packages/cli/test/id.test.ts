import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 067-spec-project-identity T-203: `spectastic id` is deterministic (FR-005,
 * NFR-001, SC-002) — repeated invocations against a fixed config yield
 * byte-identical output, and resolving never spawns a git process (the
 * derivation is confined to `init`'s write path, plan D-002).
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

function project(config: Record<string, unknown>, specIds: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-cli-id-'));
  writeFileSync(join(dir, 'spectastic.json'), JSON.stringify(config));
  for (const id of specIds) mkdirSync(join(dir, 'specs', id), { recursive: true });
  return dir;
}

describe('spectastic id (067 T-203, FR-005, NFR-001, SC-002)', () => {
  it('prints the canonical resource URI and exits 0', async () => {
    const dir = project({ project: 'acme/widget' }, ['042-example']);
    const r = await runCLI(['id', '042-example'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('spectastic://acme/widget/spec/042-example');
  });

  it('appends --anchor as a URI fragment', async () => {
    const dir = project({ project: 'acme/widget' }, ['042-example']);
    const r = await runCLI(['id', '042-example', '--anchor', 'FR-001'], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe('spectastic://acme/widget/spec/042-example#FR-001');
  });

  it('is byte-identical across repeated invocations', async () => {
    const dir = project({ project: 'acme/widget' }, ['042-example']);
    const first = await runCLI(['id', '042-example'], dir);
    const second = await runCLI(['id', '042-example'], dir);
    expect(first.stdout).toBe(second.stdout);
  });

  it('errors cleanly on an unknown spec', async () => {
    const dir = project({ project: 'acme/widget' }, ['042-example']);
    const r = await runCLI(['id', '999-nope'], dir);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('999-nope');
  });
});

/**
 * 078-federated-resource-uri T-401: red-first test for the marketplace
 * warning firing from BOTH validate surfaces (078 D-006) — the main CLI
 * (via `scanMarketplaceIdentity`, T-412) and the standalone corpus binary
 * (`spectastic-corpus validate`, T-411) — off the SAME bare-marketplace
 * fixture, while the pre-existing project-identity gate stays unaffected.
 */
const CORPUS_BIN = resolve(here, '..', '..', 'corpus', 'bin', 'spectastic-corpus');

async function runCorpusCLI(args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolveFn) => {
    const child = spawn('node', [CORPUS_BIN, ...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.stdin.end();
    child.on('close', (code) => resolveFn({ stdout, stderr, code: code ?? 0 }));
  });
}

describe('marketplace-identity warning fires on both surfaces (078 T-401, D-006)', () => {
  it('spectastic validate warns on a bare, collision-prone marketplace', async () => {
    const dir = project({ corpus: { marketplace: 'bare-name' } }, []);
    writeFileSync(join(dir, 'spec.html'), '<!doctype html><html><body>x</body></html>');
    const r = await runCLI(['validate', 'spec.html'], dir);
    expect(r.stdout + r.stderr).toContain('marketplace-identity');
    expect(r.stdout + r.stderr).toContain('warning');
  });

  it('spectastic-corpus validate warns on the SAME bare marketplace, standalone', async () => {
    const dir = project({ corpus: { marketplace: 'bare-name' } }, []);
    const r = await runCorpusCLI(['validate'], dir);
    expect(r.stdout + r.stderr).toContain('marketplace-identity');
  });

  it('an owner-qualified marketplace is silent on both surfaces', async () => {
    const dir = project({ corpus: { marketplace: 'acme/widget-pack' } }, []);
    writeFileSync(join(dir, 'spec.html'), '<!doctype html><html><body>x</body></html>');

    const cli = await runCLI(['validate', 'spec.html'], dir);
    expect(cli.stdout + cli.stderr).not.toContain('marketplace-identity');

    const corpus = await runCorpusCLI(['validate'], dir);
    expect(corpus.stdout + corpus.stderr).not.toContain('marketplace-identity');
  });

  it('the pre-existing project-identity gate is unaffected by the new scan', async () => {
    const dir = project({ project: 'bare', corpus: { marketplace: 'acme/widget-pack' } }, []);
    writeFileSync(join(dir, 'spec.html'), '<!doctype html><html><body>x</body></html>');
    const r = await runCLI(['validate', 'spec.html'], dir);
    expect(r.stdout + r.stderr).toContain('project-identity');
    expect(r.stdout + r.stderr).not.toContain('marketplace-identity');
  });
});
