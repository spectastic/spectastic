import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * SC-002 of specs/119-decision-resource-scope, end-to-end (T-113): a resource-scoped
 * decision owned by ANOTHER service, evaluated in a consumer repo, flags a touch of
 * the store — even a WELL-LAYERED write in the consumer's own persistence adapter,
 * because the defect is ownership, not layering. The owner identity comes from the
 * repo's spectastic.json (067), resolved at the CLI edge.
 *
 * Requires a fresh CLI build (`pnpm --filter @spectastic/cli build`).
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');

interface RunResult {
  stdout: string;
  code: number;
}

async function runCLI(args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolveFn) => {
    const child = spawn('node', [CLI, ...args], { cwd });
    let stdout = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.on('close', (code) => resolveFn({ stdout, code: code ?? 0 }));
  });
}

/** A consumer repo (acme/reconciliation-service) that does NOT own the positions store. */
function consumerFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'verdict-resource-'));
  // The repo's own identity — a non-owner of the datastore below.
  writeFileSync(join(dir, 'spectastic.json'), JSON.stringify({ project: 'acme/reconciliation-service' }, null, 2));
  mkdirSync(join(dir, 'specs', '002-positions'), { recursive: true });
  writeFileSync(
    join(dir, 'specs', '002-positions', 'design.html'),
    `<!doctype html><html><body>
      <spec-decision id="D-007" status="accepted" posture="block">
        <h4>D-007 — only the position-keeper service writes the positions store</h4>
        <spec-scope>
          <spec-resource coordinate="spectastic://position-keeper/position-keeper/datastore/positions"
            owner="position-keeper/position-keeper" allowed-in="src/**/persistence/**"></spec-resource>
        </spec-scope>
        <spec-reason>Every position change must emit PositionChanged; the positions store belongs to the position-keeper service.</spec-reason>
        <spec-enforcement>
          <spec-rule tool="native-content" id="no_positions_write" pattern="UPDATE\\s+positions"></spec-rule>
        </spec-enforcement>
      </spec-decision>
    </body></html>`,
  );
  // A perfectly well-layered write, inside the consumer's OWN persistence adapter.
  mkdirSync(join(dir, 'src', 'app', 'persistence'), { recursive: true });
  writeFileSync(join(dir, 'src', 'app', 'persistence', 'PositionRepo.java'), 'void save() {\n  db.exec("UPDATE positions SET qty=?");\n}\n');
  return dir;
}

describe('verdict — resource scope, non-owner flagged end-to-end (SC-002)', () => {
  it('flags a well-layered write because the consumer does not OWN the store', async () => {
    const dir = consumerFixture();
    const r = await runCLI(
      ['verdict', '--changed', 'src/app/persistence/PositionRepo.java', '--out', '.spectastic/verdict.json'],
      dir,
    );
    // A path glob would call this clean (it IS in src/**/persistence/**). Ownership, not layering.
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/VIOLATION 002-positions\/D-007/);
    expect(r.stdout).toMatch(/PositionRepo\.java/);
  });

  it('--explain routes the non-owner to the store owner, not their own directory (spec 120)', async () => {
    const dir = consumerFixture();
    const r = await runCLI(
      ['verdict', '--changed', 'src/app/persistence/PositionRepo.java', '--explain', '--out', '.spectastic/verdict.json'],
      dir,
    );
    expect(r.code).toBe(1);
    // Names the store's AUTHORITY and routes there — not a sanctioned path in this repo.
    expect(r.stdout).toMatch(/owned by position-keeper\/position-keeper/);
    expect(r.stdout).toMatch(/datastore\/positions/);
    expect(r.stdout).toMatch(/route the change through its owner/i);
    expect(r.stdout).not.toMatch(/Sanctioned path/);
  });
});
