import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * T-101 + the anti-ship gate wiring (spec 022-explore, FR-002/004/005, SC-001/002).
 * Integration over the built `spectastic` CLI: `explore` scaffolds the two
 * artifacts under explorations/<id>/, and `validate` then errors because the
 * tracked quarantine marker is present (the merge gate). Requires `pnpm build`.
 */

const here = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(here, '..', 'bin', 'spectastic');
const REPO = resolve(here, '..', '..', '..');
const TEMPLATE = readFileSync(join(REPO, 'templates', 'explore.html'), 'utf8');

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

function run(args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolveFn) => {
    const child = spawn('node', [CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
    child.on('close', (code) => resolveFn({ stdout, stderr, code: code ?? 0 }));
  });
}

/** A tmp project with the explore template + one fixture spec to validate. */
function fixtureProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-explore-'));
  mkdirSync(join(dir, 'templates'), { recursive: true });
  writeFileSync(join(dir, 'templates', 'explore.html'), TEMPLATE);
  mkdirSync(join(dir, 'specs', '001-fixture'), { recursive: true });
  writeFileSync(
    join(dir, 'specs', '001-fixture', 'spec.html'),
    '<!doctype html><html><body><spec-requirement id="FR-001"><p>A fixture.</p></spec-requirement></body></html>',
  );
  return dir;
}

describe('spectastic explore', () => {
  it('scaffolds a quarantined exploration outside specs/ (FR-002, FR-004, SC-001)', async () => {
    const dir = fixtureProject();
    const r = await run(['explore', 'try a graph view'], dir);
    expect(r.code).toBe(0);

    // Next id after specs/001-fixture is 002.
    const exDir = join(dir, 'explorations', '002-try-a-graph-view');
    expect(existsSync(join(exDir, 'explore.html'))).toBe(true);
    expect(existsSync(join(exDir, 'quarantine.json'))).toBe(true);

    const marker = JSON.parse(readFileSync(join(exDir, 'quarantine.json'), 'utf8')) as {
      id: string;
      status: string;
    };
    expect(marker.status).toBe('quarantined');
    expect(marker.id).toBe('002-try-a-graph-view');
  });

  it('makes validate error while the exploration is quarantined (FR-005, SC-002)', async () => {
    const dir = fixtureProject();
    await run(['explore', 'try a graph view'], dir);

    const r = await run(['validate', 'specs/**/*.html'], dir);
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain('explore-quarantined');
  });

  it('validate goes clean again once the exploration is deleted', async () => {
    const dir = fixtureProject();
    await run(['explore', 'try a graph view'], dir);
    // Delete the exploration (the non-graduation exit, FR-009).
    const r1 = await run(['validate', 'specs/**/*.html'], dir);
    expect(r1.code).toBe(1);

    const { rmSync } = await import('node:fs');
    rmSync(join(dir, 'explorations'), { recursive: true, force: true });

    const r2 = await run(['validate', 'specs/**/*.html'], dir);
    expect(r2.code).toBe(0);
  });

  // 022-explore triage T-001: the verb state-gate leg (FR-006). A core verb must
  // refuse to advance a quarantined exploration id — defence-in-depth beside the
  // validate merge gate.
  it('a core verb refuses to advance a quarantined exploration id (FR-006)', async () => {
    const dir = fixtureProject();
    await run(['explore', 'try a graph view'], dir);
    // The exploration is 002-try-a-graph-view; plan must refuse it (exit 2)
    // before it ever looks for a (non-existent) spec.html.
    const r = await run(['design', '002-try-a-graph-view'], dir);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('quarantined exploration');
  });
});
