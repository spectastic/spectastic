import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The contract lifecycle states (070 FR-008/FR-009).
 *
 * Before this, an in-flight design could not validate by any legal
 * declaration: the proposed location was rejected as never-effective, and the
 * effective one did not exist until promotion. A real design run resolved it by
 * writing the file to both places — performing promotion's write by hand
 * (070 T-001).
 *
 * The load-bearing row is the last. A baseline is captured at propose time so
 * promotion can refuse on a moved one, which requires BOTH copies readable
 * together — so two copies is the ordinary state of every contract amendment
 * after the first. A pre-copy rule without that distinction errors on three of
 * the committed promotion fixtures, including the one for a successful
 * promotion.
 *
 * End-to-end through the binary, following the sibling resolve test: the check
 * is a folded scan and does not fire from a bare library call.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');

const DESIGN = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>x · Design</title></head><body><main>
<spec-contract shape="request-response" path="contracts/api.openapi.yaml" format="openapi"><p>The API.</p></spec-contract>
</main></body></html>`;

/** A project in one of the five states. */
function project(opts: { effective?: string; proposed?: string; baseline?: string }): string {
  const root = mkdtempSync(join(tmpdir(), 'spectastic-contract-state-'));
  mkdirSync(join(root, 'specs', '001-x', 'contracts'), { recursive: true });
  writeFileSync(join(root, 'specs', '001-x', 'design.html'), DESIGN, 'utf8');
  if (opts.effective !== undefined) {
    mkdirSync(join(root, 'contracts'), { recursive: true });
    writeFileSync(join(root, 'contracts', 'api.openapi.yaml'), opts.effective, 'utf8');
  }
  if (opts.proposed !== undefined) {
    writeFileSync(join(root, 'specs', '001-x', 'contracts', 'api.openapi.yaml'), opts.proposed, 'utf8');
  }
  if (opts.baseline !== undefined) {
    mkdirSync(join(root, 'specs', '001-x', 'contracts', '.baseline'), { recursive: true });
    writeFileSync(join(root, 'specs', '001-x', 'contracts', '.baseline', 'api.openapi.yaml'), opts.baseline, 'utf8');
  }
  return root;
}

async function validate(cwd: string): Promise<{ stdout: string; code: number }> {
  return new Promise((res) => {
    const child = spawn('node', [CLI, 'validate', 'specs/001-x/design.html'], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stdin.end();
    child.on('close', (code) => res({ stdout, code: code ?? 0 }));
  });
}

describe('contract lifecycle states (070 FR-008/FR-009)', () => {
  it('pending — declared, authored in the sidecar, not yet promoted — is silent', async () => {
    const r = await validate(project({ proposed: 'openapi: 3.1.0' }));
    expect(r.stdout).toMatch(/no findings/);
    expect(r.code).toBe(0);
  });

  it('promoted — effective present, proposal archived — is silent', async () => {
    const r = await validate(project({ effective: 'openapi: 3.1.0' }));
    expect(r.stdout).toMatch(/no findings/);
  });

  it('missing — neither location holds it — still errors', async () => {
    const r = await validate(project({}));
    expect(r.stdout).toMatch(/no such file/);
    expect(r.code).toBe(1);
  });

  it('pre-copy — both readable, no baseline — errors and names both paths', async () => {
    const r = await validate(project({ effective: 'a', proposed: 'a' }));
    expect(r.stdout).toMatch(/readable at both the effective and proposed locations/);
    expect(r.stdout).toMatch(/contracts\/api\.openapi\.yaml/);
    expect(r.stdout).toMatch(/specs\/001-x\/contracts\/api\.openapi\.yaml/);
    expect(r.code).toBe(1);
  });

  // The regression that would break three committed promotion fixtures.
  it('amending — both readable WITH a captured baseline — is silent', async () => {
    const r = await validate(project({ effective: 'a', proposed: 'b', baseline: 'a' }));
    expect(r.stdout).toMatch(/no findings/);
    expect(r.code).toBe(0);
  });

  // A different mistake, and still one: path= names the effective location.
  it('a path under specs/ is still rejected outright', async () => {
    const root = project({ proposed: 'openapi: 3.1.0' });
    writeFileSync(
      join(root, 'specs', '001-x', 'design.html'),
      DESIGN.replace('path="contracts/api.openapi.yaml"', 'path="specs/001-x/contracts/api.openapi.yaml"'),
      'utf8',
    );
    const r = await validate(root);
    expect(r.stdout).toMatch(/can never be an effective declaration/);
    expect(r.code).toBe(1);
  });
});
