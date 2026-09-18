import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CI_FILE_PATHS } from '@spectastic/core/ci/render';
import { ciGateDriftFinding, ciGateNotIncludedFinding } from '@spectastic/core/commands/validate';
import { afterEach, describe, expect, it } from 'vitest';
import { scanCiDrift } from '../src/commands/validate.js';

/**
 * The ci-gate-drift finding + its CLI scan (spec 121-init-ci-gate, T-300).
 * Clones commands-drift.test.ts's shape: a managed file that matches the
 * render is clean; a divergent or missing one is an error.
 */
const FILE = '.github/workflows/spectastic.yml';

describe('ciGateDriftFinding', () => {
  it('is clean when the file matches the render byte-for-byte', () => {
    expect(ciGateDriftFinding('RENDER\n', 'RENDER\n', FILE)).toBeNull();
  });

  it('errors when the file has drifted from the render', () => {
    const f = ciGateDriftFinding('RENDER\n', 'STALE\n', FILE);
    expect(f?.rule).toBe('ci-gate-drift');
    expect(f?.severity).toBe('error');
    expect(f?.message).toContain('drifted');
    expect(f?.fixHint).toContain('init --tools --ci-only');
  });
});

describe('ciGateNotIncludedFinding', () => {
  it('is clean when included', () => {
    expect(ciGateNotIncludedFinding('included', FILE)).toBeNull();
  });

  it('errors — a distinct rule from drift — when missing from an existing root file', () => {
    const f = ciGateNotIncludedFinding('missing', FILE);
    expect(f?.rule).toBe('ci-gate-not-included');
    expect(f?.severity).toBe('error');
    expect(f?.rule).not.toBe('ci-gate-drift');
  });

  it('errors when there is no root file to include it at all', () => {
    const f = ciGateNotIncludedFinding('no-gitlab-ci', FILE);
    expect(f?.rule).toBe('ci-gate-not-included');
  });
});

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function tmp(): string {
  dir = mkdtempSync(join(tmpdir(), 'ci-drift-'));
  return dir;
}

describe('scanCiDrift', () => {
  it('returns nothing with no managed CI file', async () => {
    expect(await scanCiDrift(tmp())).toEqual([]);
  });

  it('errors once on a hand-edited managed file', async () => {
    const cwd = tmp();
    mkdirSync(join(cwd, '.github', 'workflows'), { recursive: true });
    // A real render's marker line, but a hand-edited body — drifted.
    writeFileSync(
      join(cwd, CI_FILE_PATHS.github),
      '# spectastic guarantee-layer CI gate — managed by `spectastic init --tools`; do not edit by hand\nname: hand-edited\n',
    );
    const findings = await scanCiDrift(cwd);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('ci-gate-drift');
  });

  it('returns nothing once the file matches the running CLI\'s render again', async () => {
    const { installCi } = await import('../src/commands/init/ci.js');
    const { cliVersion } = await import('../src/version.js');
    const cwd = tmp();
    installCi(cwd, 'github', { cliVersion: cliVersion(), force: false });
    expect(await scanCiDrift(cwd)).toEqual([]);
  });

  it('reports ci-gate-not-included for a managed GitLab sidecar whose include was removed', async () => {
    const { installCi, bootstrapGitlabRoot } = await import('../src/commands/init/ci.js');
    const { cliVersion } = await import('../src/version.js');
    const cwd = tmp();
    installCi(cwd, 'gitlab', { cliVersion: cliVersion(), force: false });
    bootstrapGitlabRoot(cwd);
    // The user deletes the include but keeps the rest of their pipeline.
    writeFileSync(join(cwd, '.gitlab-ci.yml'), 'stages: [test]\n');
    const findings = await scanCiDrift(cwd);
    expect(findings.map((f) => f.rule)).toContain('ci-gate-not-included');
    // still no drift finding — the sidecar itself is untouched
    expect(findings.map((f) => f.rule)).not.toContain('ci-gate-drift');
  });

  it('is silent for a managed GitLab sidecar whose include is present', async () => {
    const { installCi, bootstrapGitlabRoot } = await import('../src/commands/init/ci.js');
    const { cliVersion } = await import('../src/version.js');
    const cwd = tmp();
    installCi(cwd, 'gitlab', { cliVersion: cliVersion(), force: false });
    bootstrapGitlabRoot(cwd);
    expect(await scanCiDrift(cwd)).toEqual([]);
  });
});
