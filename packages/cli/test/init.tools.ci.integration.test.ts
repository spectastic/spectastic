import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CI_FILE_PATHS, CI_MANAGED_MARKER } from '@spectastic/core/ci/render';
import { afterEach, describe, expect, it } from 'vitest';
import { createTmpGitRepo, type TmpGitRepo } from '../../../tests/helpers/tmp-git-repo.js';

/**
 * `init --tools --ci` end to end in a real temp git repo (spec 121-init-ci-gate).
 * T-101 covers GitHub (US1); T-401 extends this file for GitLab (US4).
 *
 * The CLI must be built (`pnpm -C packages/cli build`) — this exercises the
 * built binary, the same one a real `init --tools` run would use.
 */

let repo: TmpGitRepo;
afterEach(() => repo?.cleanup());

describe('init --tools --ci github (US1)', () => {
  it(
    'installs a managed workflow, reports created, and is idempotent',
    { timeout: 30_000 },
    async () => {
      repo = createTmpGitRepo();
      repo.seedProject();
      mkdirSync(join(repo.dir, '.github'), { recursive: true });

      const first = await repo.runVerb(['init', '--tools', '--ci', 'github', '--ci-only']);
      expect(first.code).toBe(0);
      const path = join(repo.dir, CI_FILE_PATHS.github);
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, 'utf8');
      expect(content.split('\n')[0]).toBe(CI_MANAGED_MARKER);
      expect(content).toContain('validate');
      expect(content).toContain('enforce');
      expect(content).toContain('verdict');

      const second = await repo.runVerb(['init', '--tools', '--ci', 'github', '--ci-only']);
      expect(second.code).toBe(0);
      expect(second.stdout + second.stderr).toMatch(/unchanged/);
    },
  );

  it('spectastic validate passes clean on a freshly installed gate', { timeout: 30_000 }, async () => {
    repo = createTmpGitRepo();
    repo.seedProject();
    mkdirSync(join(repo.dir, '.github'), { recursive: true });
    await repo.runVerb(['init', '--tools', '--ci', 'github', '--ci-only']);

    const validated = await repo.runVerb(['validate', 'specs/**/*.html', '*.html']);
    expect(validated.code).toBe(0);
  });

  it('--ci-only with nothing detected and no --ci refuses (exit 2)', { timeout: 30_000 }, async () => {
    repo = createTmpGitRepo();
    repo.seedProject();
    const r = await repo.runVerb(['init', '--tools', '--ci-only']);
    expect(r.code).toBe(2);
  });

  it('an unmanaged workflow at the managed path is refused without --force', { timeout: 30_000 }, async () => {
    repo = createTmpGitRepo();
    repo.seedProject();
    mkdirSync(join(repo.dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(repo.dir, CI_FILE_PATHS.github), 'name: my-own-ci\n');

    const r = await repo.runVerb(['init', '--tools', '--ci', 'github', '--ci-only']);
    expect(r.code).toBe(2);
    expect(readFileSync(join(repo.dir, CI_FILE_PATHS.github), 'utf8')).toBe('name: my-own-ci\n');

    const forced = await repo.runVerb(['init', '--tools', '--ci', 'github', '--ci-only', '--force']);
    expect(forced.code).toBe(0);
    expect(readFileSync(join(repo.dir, CI_FILE_PATHS.github), 'utf8').split('\n')[0]).toBe(CI_MANAGED_MARKER);
  });
});

/** A spec-html artifact with an invalid requirement (no id) — a validate error. */
const BROKEN_ARTIFACT =
  '<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body><main>' +
  '<header><spec-meta><b>Status</b><span><spec-status value="draft">draft</spec-status></span></spec-meta></header>' +
  '<section id="r"><spec-requirement priority="must"><p>a requirement with no id — errors</p></spec-requirement></section>' +
  '</main></body></html>';

describe('init --tools --ci gitlab (US4)', () => {
  it('bootstraps a root .gitlab-ci.yml when none exists', { timeout: 30_000 }, async () => {
    repo = createTmpGitRepo();
    repo.seedProject();

    const r = await repo.runVerb(['init', '--tools', '--ci', 'gitlab', '--ci-only']);
    expect(r.code).toBe(0);
    expect(existsSync(join(repo.dir, CI_FILE_PATHS.gitlab))).toBe(true);
    expect(existsSync(join(repo.dir, '.gitlab-ci.yml'))).toBe(true);
    expect(r.stdout + r.stderr).toMatch(/include/);

    const validated = await repo.runVerb(['validate', 'specs/**/*.html', '*.html']);
    expect(validated.code).toBe(0);
  });

  it('never edits an existing root .gitlab-ci.yml', { timeout: 30_000 }, async () => {
    repo = createTmpGitRepo();
    repo.seedProject();
    const rootContent = 'stages: [build, test]\n# our own pipeline\n';
    writeFileSync(join(repo.dir, '.gitlab-ci.yml'), rootContent);

    const r = await repo.runVerb(['init', '--tools', '--ci', 'gitlab', '--ci-only']);
    expect(r.code).toBe(0);
    expect(readFileSync(join(repo.dir, '.gitlab-ci.yml'), 'utf8')).toBe(rootContent);
    expect(existsSync(join(repo.dir, CI_FILE_PATHS.gitlab))).toBe(true);
    // the include isn't present in the user's own file — reported, not added
    expect(r.stdout + r.stderr).toMatch(/include/);
  });
});

describe('results on the pull request (US2)', () => {
  it('enforce and verdict still run — and produce their own output — when validate fails', { timeout: 30_000 }, async () => {
    repo = createTmpGitRepo();
    repo.seedProject();
    repo.writeFile('specs/999-broken/spec.html', BROKEN_ARTIFACT);

    // Exactly the sequence the rendered workflow runs, step by step, with
    // validate deliberately failing — proving the run-regardless property
    // observed structurally in T-200 by actually executing it.
    const validated = await repo.runVerb(['validate', 'specs/**/*.html', '*.html']);
    expect(validated.code).toBe(1);

    const enforced = await repo.runVerb(['enforce']);
    expect(enforced.code).toBe(0); // no profile marker in a bare seeded project — "nothing to enforce"
    expect(enforced.stdout + enforced.stderr).toMatch(/enforce/);

    await repo.git('add', '-A');
    const verdicted = await repo.runVerb(['verdict', '--changed', 'specs/999-broken/spec.html']);
    expect(verdicted.code).toBe(0); // no governance decisions in a bare project — a clean verdict
    expect(existsSync(join(repo.dir, '.spectastic', 'verdict.json'))).toBe(true);
  });
});

describe('drift on upgrade (US3)', () => {
  it('a hand-edited managed gate fails validate; --ci-only regenerates it clean', { timeout: 30_000 }, async () => {
    repo = createTmpGitRepo();
    repo.seedProject();
    mkdirSync(join(repo.dir, '.github'), { recursive: true });
    await repo.runVerb(['init', '--tools', '--ci', 'github', '--ci-only']);

    const path = join(repo.dir, CI_FILE_PATHS.github);
    const installed = readFileSync(path, 'utf8');
    writeFileSync(path, `${installed}\n# hand-edited\n`);

    const validated = await repo.runVerb(['validate', 'specs/**/*.html', '*.html']);
    expect(validated.code).toBe(1);
    expect(validated.stdout + validated.stderr).toMatch(/ci-gate-drift/);

    const regenerated = await repo.runVerb(['init', '--tools', '--ci', 'github', '--ci-only']);
    expect(regenerated.code).toBe(0);
    expect(readFileSync(path, 'utf8')).toBe(installed);

    const clean = await repo.runVerb(['validate', 'specs/**/*.html', '*.html']);
    expect(clean.code).toBe(0);
  });
});
