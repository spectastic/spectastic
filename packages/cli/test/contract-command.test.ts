import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The `spectastic contract` resolution command (spec
 * 076-contract-export-handover, US1 / T-121), through the real binary.
 *
 * Read-only and offline by construction (FR-004): it resolves a coordinate
 * against this repository's own declarations and prints what is on disk. It
 * must never fetch, and must error cleanly on an unknown coordinate rather
 * than fabricating one.
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

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-contract-cmd-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
  return dir;
}

const DESIGN = `<!doctype html><html><body>
<spec-contract shape="request-response" path="api/invoices.yaml" format="OpenAPI"><p>reasoning</p></spec-contract>
</body></html>`;

const PROJECT_CONFIG = '{"project":"acme/billing"}';
const CONTRACT_BODY = 'openapi: 3.0.0\ninfo:\n  title: invoices\n';

describe('spectastic contract — resolution (076, US1)', () => {
  it('prints the contract at a coordinate', async () => {
    const cwd = fixture({
      'spectastic.json': PROJECT_CONFIG,
      'specs/001-invoices/design.html': DESIGN,
      'api/invoices.yaml': CONTRACT_BODY,
    });
    const r = await runCLI(['contract', 'invoices'], cwd);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('title: invoices');
  });

  it('accepts a full spectastic:// coordinate as well as a bare name', async () => {
    const cwd = fixture({
      'spectastic.json': PROJECT_CONFIG,
      'specs/001-invoices/design.html': DESIGN,
      'api/invoices.yaml': CONTRACT_BODY,
    });
    const r = await runCLI(['contract', 'spectastic://acme/billing/contract/invoices'], cwd);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('title: invoices');
  });

  it('--uri prints the canonical coordinate rather than the content', async () => {
    const cwd = fixture({
      'spectastic.json': PROJECT_CONFIG,
      'specs/001-invoices/design.html': DESIGN,
      'api/invoices.yaml': CONTRACT_BODY,
    });
    const r = await runCLI(['contract', 'invoices', '--uri'], cwd);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('spectastic://acme/billing/contract/invoices');
    expect(r.stdout).not.toContain('openapi:');
  });

  it('errors cleanly on an unknown coordinate, naming what it does know', async () => {
    const cwd = fixture({
      'spectastic.json': PROJECT_CONFIG,
      'specs/001-invoices/design.html': DESIGN,
      'api/invoices.yaml': CONTRACT_BODY,
    });
    const r = await runCLI(['contract', 'settlements'], cwd);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/No contract found/i);
    expect(r.stderr).toMatch(/invoices/); // names what it does know
    expect(r.stdout).toBe('');
  });

  it('errors when a declared contract has no file on disk — never fabricates content', async () => {
    const cwd = fixture({
      'spectastic.json': PROJECT_CONFIG,
      'specs/001-invoices/design.html': DESIGN,
      // ...and no api/invoices.yaml
    });
    const r = await runCLI(['contract', 'invoices'], cwd);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/no file exists/i);
  });

  it('errors helpfully in a project that declares no contracts at all', async () => {
    const cwd = fixture({ 'spectastic.json': PROJECT_CONFIG });
    const r = await runCLI(['contract', 'invoices'], cwd);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/declares no contracts/i);
  });

  it('is read-only — resolving twice leaves the working tree unchanged', async () => {
    const cwd = fixture({
      'spectastic.json': PROJECT_CONFIG,
      'specs/001-invoices/design.html': DESIGN,
      'api/invoices.yaml': CONTRACT_BODY,
    });
    const first = await runCLI(['contract', 'invoices'], cwd);
    const second = await runCLI(['contract', 'invoices'], cwd);
    expect(first.stdout).toBe(second.stdout);
    // The contract itself is untouched by resolution.
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(join(cwd, 'api/invoices.yaml'), 'utf8')).toBe(CONTRACT_BODY);
  });

  it('SC-002: the coordinate is unchanged when the contract file moves within the repo', async () => {
    // Same logical contract, different path — the declaration carries an
    // explicit name=, so the coordinate a consumer pinned still resolves.
    const movedDesign = `<!doctype html><html><body>
<spec-contract shape="request-response" name="invoices" path="src/main/openapi/v2/renamed.yaml" format="OpenAPI"><p>r</p></spec-contract>
</body></html>`;
    const cwd = fixture({
      'spectastic.json': PROJECT_CONFIG,
      'specs/001-invoices/design.html': movedDesign,
      'src/main/openapi/v2/renamed.yaml': CONTRACT_BODY,
    });
    const r = await runCLI(['contract', 'invoices', '--uri'], cwd);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('spectastic://acme/billing/contract/invoices');
  });
});
