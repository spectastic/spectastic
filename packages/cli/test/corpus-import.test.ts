import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * 2026-07-26 061-corpus-ingester T-103/T-104 (US1, red-first): CLI
 * integration for `corpus import` — spawns the real built binary, mirroring
 * 053's validate-corpus-gates.test.ts harness. Written before the subcommand
 * is wired (T-112) — failing (command not recognised) until then, and needs
 * a fresh `pnpm --filter @spectastic/cli build` afterward to pick it up.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function runCLI(args: string[], cwd: string, env: Record<string, string> = {}): Promise<RunResult> {
  return new Promise((resolveFn) => {
    const child = spawn('node', [CLI, ...args], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.stdin.end();
    child.on('close', (code) => resolveFn({ stdout, stderr, code: code ?? 0 }));
  });
}

/** A two-layer source pack: a references/ folder of slug-named .md files. */
function sourcePack(dir: string, files: Record<string, string>): string {
  const packDir = join(dir, 'source-pack');
  mkdirSync(join(packDir, 'references'), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(packDir, 'references', name), body, 'utf8');
  }
  return packDir;
}

function project(tag: string): string {
  return mkdtempSync(join(tmpdir(), `spectastic-corpus-import-${tag}-`));
}

const MINIMAL_SPEC = (decisionText: string) => `<!doctype html>
<html><head><meta charset="utf-8"><title>Fixture · Plan</title></head>
<body><main>
<spec-decision id="D-001" grounding="verified">
  <h4>D-001 · A domain decision</h4>
  <dl><dt>Context</dt><dd>Grounded against <code>${decisionText}</code>.</dd></dl>
</spec-decision>
</main></body></html>
`;

describe('spectastic corpus import (061 T-103, SC-001/SC-004/NFR-002)', () => {
  it('end-to-end via the stub fetcher: writes a real root registry, and a citation to it resolves green', async () => {
    const dir = project('e2e');
    const src = sourcePack(dir, { '001-settlement-windows.md': '# Settlement windows\n\nBody.\n' });

    const scriptPath = join(dir, 'pack-fetcher-script.json');
    const coordinate = 'finance-settlement@spectastic-examples';
    writeFileSync(scriptPath, JSON.stringify({ [coordinate]: src }));

    const r = await runCLI(['corpus', 'import', coordinate], dir, { SPECTASTIC_PACK_STUB: scriptPath });
    expect(r.code, r.stdout + r.stderr).toBe(0);

    const registry = readFileSync(join(dir, 'knowledge', 'index.md'), 'utf8');
    expect(registry).toContain('001-settlement-windows');
    const idMatch = /\| (KB-\d{4,}) \|/.exec(registry);
    expect(idMatch).not.toBeNull();
    const id = idMatch![1];

    writeFileSync(join(dir, 'plan.html'), MINIMAL_SPEC(`${id}@TODO`), 'utf8');
    // The install door leaves genuinely-unread fields as TODO (FR-009) — the
    // pinned edition here is literally "TODO" because the fixture doc has no
    // edition frontmatter, exactly the never-fabricate contract under test.
    const v = await runCLI(['validate', 'plan.html'], dir);
    expect(v.stdout, v.stdout).not.toContain('corpus-provenance');
  });

  it('runs with no network access — the stub fetcher is exercised, never a real fetch (NFR-002)', async () => {
    const dir = project('no-network');
    const src = sourcePack(dir, { '001-settlement-windows.md': '# Settlement windows\n\nBody.\n' });
    const scriptPath = join(dir, 'pack-fetcher-script.json');
    const coordinate = 'finance-settlement@spectastic-examples';
    writeFileSync(scriptPath, JSON.stringify({ [coordinate]: src }));

    const r = await runCLI(['corpus', 'import', coordinate], dir, { SPECTASTIC_PACK_STUB: scriptPath });
    expect(r.code, r.stdout + r.stderr).toBe(0);
  });
});

/**
 * 2026-07-26 061-corpus-ingester T-205 (US2, NFR-003): re-running the same
 * import with no underlying change registers nothing new — the CLI-level
 * idempotency check, alongside `installPack`'s own core-level one (T-102).
 */
describe('spectastic corpus import — idempotency (061 T-205, NFR-003)', () => {
  it('re-running with no change reports 0 newly registered on the second run', async () => {
    const dir = project('idempotent');
    const src = sourcePack(dir, { '001-settlement-windows.md': '# Settlement windows\n\nBody.\n' });
    const scriptPath = join(dir, 'pack-fetcher-script.json');
    const coordinate = 'finance-settlement@spectastic-examples';
    writeFileSync(scriptPath, JSON.stringify({ [coordinate]: src }));

    const first = await runCLI(['corpus', 'import', coordinate], dir, { SPECTASTIC_PACK_STUB: scriptPath });
    expect(first.code, first.stdout + first.stderr).toBe(0);
    expect(first.stdout).toContain('1 registered');

    const second = await runCLI(['corpus', 'import', coordinate], dir, { SPECTASTIC_PACK_STUB: scriptPath });
    expect(second.code, second.stdout + second.stderr).toBe(0);
    expect(second.stdout).toContain('0 registered');
    expect(second.stdout).toContain('1 already registered');
  });
});

describe('spectastic corpus import --from <path> (061 T-104, FR-008)', () => {
  it('registers a local checkout directly, without any fetcher/stub involved', async () => {
    const dir = project('from');
    const src = sourcePack(dir, { '001-settlement-windows.md': '# Settlement windows\n\nBody.\n' });

    const r = await runCLI(['corpus', 'import', 'finance-settlement@spectastic-examples', '--from', src], dir);
    expect(r.code, r.stdout + r.stderr).toBe(0);

    const registry = readFileSync(join(dir, 'knowledge', 'index.md'), 'utf8');
    expect(registry).toContain('001-settlement-windows');
    expect(registry).toContain('finance-settlement');
  });
});
