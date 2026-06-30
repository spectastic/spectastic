import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createTmpGitRepo, type TmpGitRepo, type StubScript } from '../../../tests/helpers/tmp-git-repo.js';
import { gitRunner } from '../src/git/run.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/**
 * US1 integration suite (T-100..T-103, T-900) for specs/026-git-strategy. Drives
 * the real `spectastic spec` verb in a throwaway git repo with the stub
 * AIProvider, and asserts the actual branch + commit — the behavioral proof of
 * SC-001/SC-002/SC-003 that a structural check can't give.
 *
 * Precondition: the CLI must be built (`pnpm --filter @spectastic/cli build`),
 * since the harness spawns `packages/cli/bin/spectastic` → `dist/index.js`.
 */

// The kernel makes one chat() call returning the spec JSON (mirrors
// packages/cli/test/fixtures/spec-script.json). It renders a valid spec that
// passes `validate`, so the commit gate lets the happy path through.
const SPEC_STUB: StubScript = {
  chat: [
    JSON.stringify({
      tldr: 'A test feature spec.',
      smallestDemoable: 'The smallest version that delivers value.',
      stories: [
        { id: 'US1', title: 'Main story', role: 'user', want: 'do the thing', outcome: 'value delivered', acceptance: 'observable when the thing happens', priority: 'P1' },
      ],
      frs: [
        { id: 'FR-001', priority: 'must', body: 'The system MUST do the thing.' },
        { id: 'FR-002', priority: 'should', body: 'The system SHOULD do it well.' },
      ],
      nfrs: [{ id: 'NFR-001', priority: 'must', body: 'Performance MUST be acceptable.' }],
      scs: [{ id: 'SC-001', priority: 'must', body: 'At least 80% of users complete the flow.' }],
    }),
  ],
};

let repo: TmpGitRepo;
afterEach(() => repo?.cleanup());

describe('git layer · US1 (spec 026)', () => {
  it('T-100/SC-001: branch+commit creates NNN-slug and commits spec(NNN): <subject>', async () => {
    repo = createTmpGitRepo();
    repo.writeFile('spectastic.json', JSON.stringify({ git: { auto: 'branch+commit' } }));

    const r = await repo.runVerb(['spec', 'git strategy feature'], { stub: SPEC_STUB });
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);

    expect(await repo.currentBranch()).toBe('001-git-strategy-feature');
    expect(await repo.headSubject()).toBe('spec(001): git strategy feature');
  });

  it('T-101/SC-002: git.auto=off (default) makes no commit and no branch', async () => {
    repo = createTmpGitRepo();
    await repo.git('commit', '--allow-empty', '-m', 'seed'); // born main
    const before = await repo.commitCount();

    // No spectastic.json → auto defaults to off.
    const r = await repo.runVerb(['spec', 'untracked feature'], { stub: SPEC_STUB });
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);

    expect(await repo.currentBranch()).toBe('main'); // no branch created
    expect(await repo.commitCount()).toBe(before); // no commit created
  });

  it('T-102/SC-003: a quarantined exploration fails the gate — no commit, loud, exit 1', async () => {
    repo = createTmpGitRepo();
    await repo.git('commit', '--allow-empty', '-m', 'seed');
    const before = await repo.commitCount();
    // A live quarantine marker → the validate gate must refuse the commit (FR-008).
    mkdirSync(join(repo.dir, 'explorations', '099-quarantined'), { recursive: true });
    writeFileSync(
      join(repo.dir, 'explorations', '099-quarantined', 'quarantine.json'),
      JSON.stringify({ id: '099-quarantined', status: 'quarantined', created: '2026-06-29' }),
    );
    repo.writeFile('spectastic.json', JSON.stringify({ git: { auto: 'branch+commit' } }));

    const r = await repo.runVerb(['spec', 'blocked feature'], { stub: SPEC_STUB });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('NOT committed');
    expect(await repo.commitCount()).toBe(before); // no commit
    expect(await repo.currentBranch()).toBe('main'); // branch creation is AFTER the gate
  });

  it('T-103/D-006: staging is scoped — an unrelated dirty file is not swept into the commit', async () => {
    repo = createTmpGitRepo();
    await repo.git('commit', '--allow-empty', '-m', 'seed');
    repo.writeFile('unrelated.txt', 'i am dirty and unrelated');
    repo.writeFile('spectastic.json', JSON.stringify({ git: { auto: 'commit' } }));

    const r = await repo.runVerb(['spec', 'scoped feature'], { stub: SPEC_STUB });
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);

    const committed = (await repo.git('show', '--name-only', '--format=', 'HEAD'))
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    expect(committed.some((p) => p.endsWith('spec.html'))).toBe(true);
    expect(committed).not.toContain('unrelated.txt');
    // The unrelated file survives, still untracked.
    expect(await repo.git('status', '--porcelain')).toContain('unrelated.txt');
  });

  // T-113: the other verbs route through the same helper. Two cases prove both
  // grammar branches end-to-end — a scoped non-spec verb, and an unscoped one.
  it('T-113: plan commits the scoped plan(NNN): subject on the current branch (no branch)', async () => {
    repo = createTmpGitRepo();
    await repo.git('commit', '--allow-empty', '-m', 'seed');
    mkdirSync(join(repo.dir, 'specs', '001-foo'), { recursive: true });
    writeFileSync(
      join(repo.dir, 'specs', '001-foo', 'spec.html'),
      '<!doctype html><html><body><main><spec-meta></spec-meta></main></body></html>',
    );
    repo.writeFile('spectastic.json', JSON.stringify({ git: { auto: 'commit' } }));

    const r = await repo.runVerb(['plan', '001-foo'], {
      env: { SPECTASTIC_AI_STUB: join(FIXTURES, 'plan-script.json') },
    });
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    expect(await repo.currentBranch()).toBe('main'); // plan never opens a branch
    expect(await repo.headSubject()).toBe('plan(001): foo');
  });

  it('T-113: principles commits the unscoped principles: subject (spec-less verb)', async () => {
    repo = createTmpGitRepo();
    await repo.git('commit', '--allow-empty', '-m', 'seed');
    repo.writeFile('spectastic.json', JSON.stringify({ git: { auto: 'commit' } }));

    const r = await repo.runVerb(['principles', '--name', 'Foo'], {
      env: { SPECTASTIC_AI_STUB: join(FIXTURES, 'principles-script.json') },
    });
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);
    expect(await repo.currentBranch()).toBe('main');
    expect(await repo.headSubject()).toBe('principles: Foo'); // no (NNN) — scope omitted
  });

  it('T-900/NFR-001: the layer\'s own work (branch + stage + commit) adds ≤ 1 s', async () => {
    repo = createTmpGitRepo();
    await repo.git('commit', '--allow-empty', '-m', 'seed');
    repo.writeFile('a.txt', 'one');
    const runner = gitRunner(repo.dir);

    const start = process.hrtime.bigint();
    await runner.createBranch('001-perf');
    await runner.add(['a.txt']);
    await runner.commit('spec(001): perf probe');
    const ms = Number(process.hrtime.bigint() - start) / 1e6;

    expect(ms, `git layer overhead was ${ms.toFixed(0)}ms`).toBeLessThan(1000);
    expect(await repo.headSubject()).toBe('spec(001): perf probe');
  });
});
