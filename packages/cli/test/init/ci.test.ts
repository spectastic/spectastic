import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CI_FILE_PATHS, CI_MANAGED_MARKER } from '@spectastic/core/ci/render';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bootstrapGitlabRoot,
  ciManaged,
  detectCiHosts,
  gitlabIncludeState,
  installCi,
  parseCiSelection,
  removeCi,
  removeGitlabBootstrap,
  resolveCiHosts,
} from '../../src/commands/init/ci.js';
import { ToolsError } from '../../src/commands/init/errors.js';

/**
 * Unit tests for the CI installer (spec 121-init-ci-gate, T-100). US1's scope
 * is GitHub-only; the module underneath is host-generic by construction (both
 * hosts write to a per-host sidecar path the same way), so these tests cover
 * detection/install/remove for both — the GitLab-specific bootstrap and
 * include-state pieces are added in T-400/T-410.
 */

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function tmp(): string {
  dir = mkdtempSync(join(tmpdir(), 'ci-install-'));
  return dir;
}

describe('parseCiSelection', () => {
  it('accepts the four legal values, defaulting to auto', () => {
    expect(parseCiSelection(undefined)).toBe('auto');
    expect(parseCiSelection('github')).toBe('github');
    expect(parseCiSelection('gitlab')).toBe('gitlab');
    expect(parseCiSelection('both')).toBe('both');
    expect(parseCiSelection('auto')).toBe('auto');
  });

  it('throws ToolsError on an illegal value', () => {
    expect(() => parseCiSelection('bitbucket')).toThrow(ToolsError);
  });
});

describe('detectCiHosts', () => {
  it('detects neither host in an empty project', () => {
    expect(detectCiHosts(tmp())).toEqual([]);
  });

  it('detects github from a .github/ directory', () => {
    const cwd = tmp();
    mkdirSync(join(cwd, '.github'), { recursive: true });
    expect(detectCiHosts(cwd)).toEqual(['github']);
  });

  it('detects gitlab from a .gitlab-ci.yml file', () => {
    const cwd = tmp();
    writeFileSync(join(cwd, '.gitlab-ci.yml'), 'stages: [test]\n');
    expect(detectCiHosts(cwd)).toEqual(['gitlab']);
  });

  it('detects gitlab from a .gitlab/ directory alone', () => {
    const cwd = tmp();
    mkdirSync(join(cwd, '.gitlab'), { recursive: true });
    expect(detectCiHosts(cwd)).toEqual(['gitlab']);
  });

  it('detects both when both are present', () => {
    const cwd = tmp();
    mkdirSync(join(cwd, '.github'), { recursive: true });
    mkdirSync(join(cwd, '.gitlab'), { recursive: true });
    expect(detectCiHosts(cwd).sort()).toEqual(['github', 'gitlab']);
  });
});

describe('resolveCiHosts', () => {
  it('resolves an explicit host to itself', () => {
    expect(resolveCiHosts('github', tmp())).toEqual(['github']);
    expect(resolveCiHosts('gitlab', tmp())).toEqual(['gitlab']);
  });

  it('resolves both to both hosts', () => {
    expect(resolveCiHosts('both', tmp()).sort()).toEqual(['github', 'gitlab']);
  });

  it('resolves auto to detection', () => {
    const cwd = tmp();
    mkdirSync(join(cwd, '.github'), { recursive: true });
    expect(resolveCiHosts('auto', cwd)).toEqual(['github']);
  });
});

describe('installCi', () => {
  it('creates a managed file when none exists', () => {
    const cwd = tmp();
    const result = installCi(cwd, 'github', { cliVersion: '1.0.0', force: false });
    expect(result.outcome).toBe('created');
    expect(result.path).toBe(join(cwd, CI_FILE_PATHS.github));
    const content = readFileSync(result.path, 'utf8');
    expect(content.split('\n')[0]).toBe(CI_MANAGED_MARKER);
    expect(content).toContain('@spectastic/cli@1.0.0');
  });

  it('is idempotent — re-installing the same version reports unchanged', () => {
    const cwd = tmp();
    installCi(cwd, 'github', { cliVersion: '1.0.0', force: false });
    const result = installCi(cwd, 'github', { cliVersion: '1.0.0', force: false });
    expect(result.outcome).toBe('unchanged');
  });

  it('reports updated when a newer version is installed over a managed file', () => {
    const cwd = tmp();
    installCi(cwd, 'github', { cliVersion: '1.0.0', force: false });
    const result = installCi(cwd, 'github', { cliVersion: '2.0.0', force: false });
    expect(result.outcome).toBe('updated');
    expect(readFileSync(result.path, 'utf8')).toContain('@spectastic/cli@2.0.0');
  });

  it('refuses to overwrite an unmanaged file without --force', () => {
    const cwd = tmp();
    const path = join(cwd, CI_FILE_PATHS.github);
    mkdirSync(join(cwd, '.github', 'workflows'), { recursive: true });
    writeFileSync(path, 'name: my-own-ci\n');
    expect(() => installCi(cwd, 'github', { cliVersion: '1.0.0', force: false })).toThrow(ToolsError);
    // the refusal names the path
    try {
      installCi(cwd, 'github', { cliVersion: '1.0.0', force: false });
    } catch (err) {
      expect((err as Error).message).toContain(path);
    }
    expect(readFileSync(path, 'utf8')).toBe('name: my-own-ci\n');
  });

  it('overwrites an unmanaged file with --force', () => {
    const cwd = tmp();
    const path = join(cwd, CI_FILE_PATHS.github);
    mkdirSync(join(cwd, '.github', 'workflows'), { recursive: true });
    writeFileSync(path, 'name: my-own-ci\n');
    const result = installCi(cwd, 'github', { cliVersion: '1.0.0', force: true });
    expect(result.outcome).toBe('updated');
    expect(readFileSync(path, 'utf8').split('\n')[0]).toBe(CI_MANAGED_MARKER);
  });
});

describe('ciManaged', () => {
  it('is false with no file, true once installed', () => {
    const cwd = tmp();
    expect(ciManaged(cwd, 'github')).toBe(false);
    installCi(cwd, 'github', { cliVersion: '1.0.0', force: false });
    expect(ciManaged(cwd, 'github')).toBe(true);
  });

  it('is false for an unmanaged file at the same path', () => {
    const cwd = tmp();
    mkdirSync(join(cwd, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(cwd, CI_FILE_PATHS.github), 'name: my-own-ci\n');
    expect(ciManaged(cwd, 'github')).toBe(false);
  });
});

describe('removeCi', () => {
  it('removes a managed file', () => {
    const cwd = tmp();
    installCi(cwd, 'github', { cliVersion: '1.0.0', force: false });
    expect(removeCi(cwd, 'github').removed).toBe(true);
    expect(existsSync(join(cwd, CI_FILE_PATHS.github))).toBe(false);
  });

  it('leaves an unmanaged file untouched', () => {
    const cwd = tmp();
    const path = join(cwd, CI_FILE_PATHS.github);
    mkdirSync(join(cwd, '.github', 'workflows'), { recursive: true });
    writeFileSync(path, 'name: my-own-ci\n');
    expect(removeCi(cwd, 'github').removed).toBe(false);
    expect(existsSync(path)).toBe(true);
  });

  it('is a no-op when nothing exists', () => {
    expect(removeCi(tmp(), 'github').removed).toBe(false);
  });

  it('installs/removes a gitlab sidecar the same way as github', () => {
    const cwd = tmp();
    const result = installCi(cwd, 'gitlab', { cliVersion: '1.0.0', force: false });
    expect(result.outcome).toBe('created');
    expect(result.path).toBe(join(cwd, CI_FILE_PATHS.gitlab));
    expect(ciManaged(cwd, 'gitlab')).toBe(true);
    expect(removeCi(cwd, 'gitlab').removed).toBe(true);
    expect(existsSync(result.path)).toBe(false);
  });
});

describe('gitlabIncludeState', () => {
  it('is no-gitlab-ci when the root file is absent', () => {
    expect(gitlabIncludeState(tmp())).toBe('no-gitlab-ci');
  });

  it('is missing when the root file exists but lacks the include', () => {
    const cwd = tmp();
    writeFileSync(join(cwd, '.gitlab-ci.yml'), 'stages: [test]\n');
    expect(gitlabIncludeState(cwd)).toBe('missing');
  });

  it('is included when the root file carries the sidecar include', () => {
    const cwd = tmp();
    writeFileSync(join(cwd, '.gitlab-ci.yml'), `include:\n  - local: '/${CI_FILE_PATHS.gitlab}'\n`);
    expect(gitlabIncludeState(cwd)).toBe('included');
  });
});

describe('bootstrapGitlabRoot', () => {
  it('creates a minimal root file with the include when none exists', () => {
    const cwd = tmp();
    const result = bootstrapGitlabRoot(cwd);
    expect(result.created).toBe(true);
    expect(gitlabIncludeState(cwd)).toBe('included');
    const content = readFileSync(result.path, 'utf8');
    expect(content.split('\n')[0]).toBe(CI_MANAGED_MARKER);
  });

  it('never touches an existing root file', () => {
    const cwd = tmp();
    writeFileSync(join(cwd, '.gitlab-ci.yml'), 'stages: [test]\n# my own pipeline\n');
    const result = bootstrapGitlabRoot(cwd);
    expect(result.created).toBe(false);
    expect(readFileSync(join(cwd, '.gitlab-ci.yml'), 'utf8')).toBe('stages: [test]\n# my own pipeline\n');
  });
});

describe('removeGitlabBootstrap', () => {
  it('removes the bootstrap file only while it is still byte-identical', () => {
    const cwd = tmp();
    bootstrapGitlabRoot(cwd);
    expect(removeGitlabBootstrap(cwd).removed).toBe(true);
    expect(existsSync(join(cwd, '.gitlab-ci.yml'))).toBe(false);
  });

  it('leaves a grown root file untouched, even though it started as the bootstrap', () => {
    const cwd = tmp();
    const { path } = bootstrapGitlabRoot(cwd);
    writeFileSync(path, `${readFileSync(path, 'utf8')}\nstages: [test]\n`, 'utf8');
    expect(removeGitlabBootstrap(cwd).removed).toBe(false);
    expect(existsSync(path)).toBe(true);
  });

  it('is a no-op with no root file', () => {
    expect(removeGitlabBootstrap(tmp()).removed).toBe(false);
  });
});
