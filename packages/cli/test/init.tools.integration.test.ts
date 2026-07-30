import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTmpGitRepo, type TmpGitRepo } from '../../../tests/helpers/tmp-git-repo.js';

/**
 * US1 of specs/031-init-tools/tasks.html (T-100..102). The pre-commit gate,
 * end to end in a real temp git repo: a commit is rejected when validate finds
 * an error (SC-001) or an open question in an Accepted spec (SC-002/FR-004), and
 * a pre-existing hook is preserved and chained (SC-006/FR-006).
 *
 * The CLI must be built (`pnpm -C packages/cli build`) — the installed hook
 * invokes the built `validate`.
 */

/** Run `git commit` without throwing on the non-zero exit the gate produces.
 *  `out` is the hook's combined stdout+stderr (git forwards both), so a test can
 *  assert on the finding message the gate printed. */
function tryCommit(cwd: string, message: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', ['commit', '-m', message], { cwd });
    let out = '';
    child.stdout.on('data', (c: Buffer) => (out += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (out += c.toString('utf8')));
    child.on('close', (code) => resolve({ code: code ?? 0, out }));
  });
}

/** A spec-html artifact with an invalid requirement (no id) — a validate error. */
const BROKEN_ARTIFACT =
  '<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body><main>' +
  '<header><spec-meta><b>Status</b><span><spec-status value="draft">draft</spec-status></span></spec-meta></header>' +
  '<section id="r"><spec-requirement priority="must"><p>a requirement with no id — errors</p></spec-requirement></section>' +
  '</main></body></html>';

/** A clean spec-html artifact at `status` (used as a legit staged change). */
function cleanArtifact(status: string): string {
  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body><main>' +
    `<header><spec-meta><b>Status</b><span><spec-status value="${status}">${status}</spec-status></span></spec-meta></header>` +
    '<section id="q"><spec-questions><p>None.</p></spec-questions></section>' +
    '</main></body></html>'
  );
}

/** An artifact at `status` carrying an open <spec-question> admonition — an error
 *  when Accepted (no-unresolved-question), a warning when Draft. */
function withOpenQuestion(status: string): string {
  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body><main>' +
    `<header><spec-meta><b>Status</b><span><spec-status value="${status}">${status}</spec-status></span></spec-meta></header>` +
    '<section id="q"><spec-question><p>an unresolved question</p></spec-question></section>' +
    '</main></body></html>'
  );
}

let repo: TmpGitRepo;
afterEach(() => repo?.cleanup());

describe('init --tools · pre-commit gate (US1)', () => {
  it('T-100/SC-001: a validate error blocks the commit; a clean commit passes', {
    timeout: 30_000,
  }, async () => {
    repo = createTmpGitRepo();
    repo.seedProject();
    const r = await repo.runVerb(['init', '--hooks-only']);
    expect(r.code).toBe(0);

    // A clean seeded project commits fine (the gate validates clean).
    await repo.git('add', '-A');
    const clean = await tryCommit(repo.dir, 'seed');
    expect(clean.code).toBe(0);

    // Stage a legit change AND a broken artifact → the commit is rejected.
    repo.writeFile('specs/902-note/spec.html', cleanArtifact('draft'));
    repo.writeFile('specs/903-broken/spec.html', BROKEN_ARTIFACT);
    await repo.git('add', '-A');
    const before = await repo.commitCount();
    const blocked = await tryCommit(repo.dir, 'ship a broken artifact');
    expect(blocked.code).not.toBe(0);
    expect(await repo.commitCount()).toBe(before); // nothing landed

    // Remove the error, leaving the legit change staged → the commit succeeds.
    await repo.git('rm', '-f', 'specs/903-broken/spec.html');
    const fixed = await tryCommit(repo.dir, 'the legit change lands once clean');
    expect(fixed.code).toBe(0);
    expect(await repo.commitCount()).toBe(before + 1);
  });

  it('T-101/SC-002: an open question blocks in an Accepted spec, not a Draft', {
    timeout: 30_000,
  }, async () => {
    repo = createTmpGitRepo();
    repo.seedProject();
    await repo.runVerb(['init', '--hooks-only']);
    await repo.git('add', '-A');
    expect((await tryCommit(repo.dir, 'seed')).code).toBe(0);

    // Open question in an ACCEPTED spec → error → blocked.
    repo.writeFile('specs/900-accepted/spec.html', withOpenQuestion('accepted'));
    await repo.git('add', '-A');
    const blocked = await tryCommit(repo.dir, 'open question in accepted');
    expect(blocked.code).not.toBe(0);

    // Fully revert the accepted change (from HEAD, index + worktree); put the
    // same open question in a DRAFT spec → warning only → the commit passes.
    await repo.git('checkout', 'HEAD', '--', 'specs/900-accepted/spec.html');
    repo.writeFile('specs/901-draft/spec.html', withOpenQuestion('draft'));
    await repo.git('add', '-A');
    const passed = await tryCommit(repo.dir, 'open question in draft is fine');
    expect(passed.code).toBe(0);
  });

  it('T-102/SC-006/FR-006: a pre-existing pre-commit hook is preserved and chained', {
    timeout: 30_000,
  }, async () => {
    repo = createTmpGitRepo();
    repo.seedProject();
    // A foreign hook that leaves a side-effect file so we can prove it ran.
    const hookPath = join(repo.dir, '.git', 'hooks', 'pre-commit');
    writeFileSync(hookPath, '#!/usr/bin/env bash\ntouch "$(dirname "$0")/../../prior-ran"\nexit 0\n', { mode: 0o755 });

    await repo.runVerb(['init', '--hooks-only']);

    // The prior hook was preserved.
    expect(existsSync(join(repo.dir, '.git', 'hooks', 'pre-commit.prior'))).toBe(true);
    // Our gate is installed and references the prior.
    expect(readFileSync(hookPath, 'utf8')).toContain('pre-commit.prior');

    // A commit runs both: the prior's side-effect file appears, and the gate passes.
    repo.writeFile('specs/903-note/spec.html', withOpenQuestion('draft'));
    await repo.git('add', '-A');
    const r = await tryCommit(repo.dir, 'commit runs both hooks');
    expect(r.code).toBe(0);
    expect(existsSync(join(repo.dir, 'prior-ran'))).toBe(true);
  });
});

describe('init --tools · drift-proof adapters (US2)', () => {
  it("T-200/SC-003/FR-007: adapter tracks source; a stale adapter can't be committed", {
    timeout: 30_000,
  }, async () => {
    repo = createTmpGitRepo();
    repo.seedProject();
    await repo.runVerb(['init', '--tools']); // both halves: gate + managed adapters

    // The adapter is a verbatim copy of source.
    const src = readFileSync(join(repo.dir, 'commands', 'spectastic.spec.md'), 'utf8');
    const adapterPath = join(repo.dir, '.claude', 'commands', 'spectastic.spec.md');
    expect(readFileSync(adapterPath, 'utf8')).toBe(src);

    await repo.git('add', '-A');
    expect((await tryCommit(repo.dir, 'seed with managed adapters')).code).toBe(0);

    // Edit the source → the managed adapter is now stale → commit is blocked.
    repo.writeFile('commands/spectastic.spec.md', `${src}\n<!-- edited source -->\n`);
    await repo.git('add', '-A');
    const blocked = await tryCommit(repo.dir, 'ship a stale adapter');
    expect(blocked.code).not.toBe(0);
    expect(blocked.out).toContain('commands-drift');

    // Regenerate (no manual copy) → the adapter matches again → commit succeeds.
    await repo.runVerb(['init', '--tools', '--commands-only']);
    expect(readFileSync(adapterPath, 'utf8')).toBe(
      readFileSync(join(repo.dir, 'commands', 'spectastic.spec.md'), 'utf8'),
    );
    await repo.git('add', '-A');
    expect((await tryCommit(repo.dir, 'regenerated adapter lands')).code).toBe(0);
  });

  it('T-901/SC-004/FR-001: re-running init --tools is idempotent', {
    timeout: 30_000,
  }, async () => {
    repo = createTmpGitRepo();
    repo.seedProject();
    await repo.runVerb(['init', '--tools']);
    const hookPath = join(repo.dir, '.git', 'hooks', 'pre-commit');
    const adapterPath = join(repo.dir, '.claude', 'commands', 'spectastic.spec.md');
    const hook1 = readFileSync(hookPath, 'utf8');
    const adapter1 = readFileSync(adapterPath, 'utf8');

    const second = await repo.runVerb(['init', '--tools']);
    expect(second.code).toBe(0);
    expect(readFileSync(hookPath, 'utf8')).toBe(hook1); // identical hook
    expect(readFileSync(adapterPath, 'utf8')).toBe(adapter1); // identical adapter
    // The second run must not treat our own hook as a foreign prior to chain.
    expect(existsSync(join(repo.dir, '.git', 'hooks', 'pre-commit.prior'))).toBe(false);
  });
});
