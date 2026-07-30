import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createTmpGitRepo, type TmpGitRepo } from '../../../tests/helpers/tmp-git-repo.js';

/**
 * US1 integration suite for specs/027-git-trailers (T-100..T-102). Drives the
 * real `plan` verb in a throwaway git repo with git.trailers on, and asserts the
 * actual commit footer — Author/Reviewed-by/Co-authored-by from the spec's
 * <spec-meta>. Precondition: the CLI is built.
 */

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const PLAN_STUB = join(FIXTURES, 'plan-script.json');

/** A spec.html carrying Owner + Reviewers — the attribution source. */
function seedSpec(repo: TmpGitRepo, owner: string, reviewers: string): void {
  mkdirSync(join(repo.dir, 'specs', '027-demo'), { recursive: true });
  writeFileSync(
    join(repo.dir, 'specs', '027-demo', 'spec.html'),
    `<!doctype html><html><body><main>
      <p class="small-caps">Specification · 027-demo</p>
      <spec-meta>
        <b>Status</b><span><spec-status value="accepted">Accepted</spec-status></span>
        <b>Owner</b><span>${owner}</span>
        <b>Reviewers</b><span>${reviewers}</span>
      </spec-meta>
    </main></body></html>`,
  );
}

let repo: TmpGitRepo;
afterEach(() => repo?.cleanup());

describe('git trailers · US1 (spec 027)', () => {
  it('T-100/SC-001: git.trailers=on → footer carries Author + Reviewed-by from <spec-meta>', async () => {
    repo = createTmpGitRepo();
    await repo.git('commit', '--allow-empty', '-m', 'seed');
    seedSpec(repo, 'Brian Corbin · @briancorbinxyz', 'Jane Reviewer · @jane');
    repo.writeFile('spectastic.json', JSON.stringify({ git: { auto: 'commit', trailers: 'on' } }));

    const r = await repo.runVerb(['plan', '027-demo'], {
      env: { SPECTASTIC_AI_STUB: PLAN_STUB },
    });
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);

    const body = await repo.git('log', '-1', '--format=%B');
    expect(body).toContain('Author: Brian Corbin · @briancorbinxyz');
    expect(body).toContain('Reviewed-by: Jane Reviewer · @jane');
  });

  it('T-101/SC-002: git.trailers=off (default) → no trailers in the footer', async () => {
    repo = createTmpGitRepo();
    await repo.git('commit', '--allow-empty', '-m', 'seed');
    seedSpec(repo, 'Brian Corbin · @briancorbinxyz', 'Jane Reviewer · @jane');
    // git.auto commits, but trailers default off.
    repo.writeFile('spectastic.json', JSON.stringify({ git: { auto: 'commit' } }));

    const r = await repo.runVerb(['plan', '027-demo'], {
      env: { SPECTASTIC_AI_STUB: PLAN_STUB },
    });
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);

    const body = await repo.git('log', '-1', '--format=%B');
    expect(body).not.toContain('Author:');
    expect(body).not.toContain('Reviewed-by:');
  });

  it('T-102/FR-004: Co-authored-by appears when the spec author ≠ the committer, absent when equal', async () => {
    repo = createTmpGitRepo();
    await repo.git('commit', '--allow-empty', '-m', 'seed');
    seedSpec(repo, 'Alice Author · @alice', '—');
    repo.writeFile('spectastic.json', JSON.stringify({ git: { auto: 'commit', trailers: 'on' } }));

    // Committer is Bob, not Alice → Co-authored-by: Alice.
    await repo.git('config', 'user.name', 'Bob Builder');
    const r1 = await repo.runVerb(['plan', '027-demo'], {
      env: { SPECTASTIC_AI_STUB: PLAN_STUB },
    });
    expect(r1.code, `stderr: ${r1.stderr}`).toBe(0);
    expect(await repo.git('log', '-1', '--format=%B')).toContain('Co-authored-by: Alice Author · @alice');

    // Now the committer IS Alice → no Co-authored-by (would duplicate authorship).
    await repo.git('config', 'user.name', 'Alice Author');
    const r2 = await repo.runVerb(['plan', '027-demo', '--force'], {
      env: { SPECTASTIC_AI_STUB: PLAN_STUB },
    });
    expect(r2.code, `stderr: ${r2.stderr}`).toBe(0);
    expect(await repo.git('log', '-1', '--format=%B')).not.toContain('Co-authored-by:');
  });
});

/** A minimal valid tasks.html with two tasks (so ticking one doesn't trigger a flip). */
function seedTasks(repo: TmpGitRepo): void {
  writeFileSync(
    join(repo.dir, 'specs', '027-demo', 'tasks.html'),
    `<!doctype html><html><body><main>
      <p class="small-caps">Tasks · 027-demo</p>
      <spec-meta><b>Status</b><span><spec-status value="draft">Draft</spec-status></span></spec-meta>
      <section id="phase-setup" class="phase"><h2>Phase</h2>
        <spec-task id="T-001"><input type="checkbox"><div><strong>One</strong> <span class="path">a.ts</span></div></spec-task>
        <spec-task id="T-002"><input type="checkbox"><div><strong>Two</strong> <span class="path">b.ts</span></div></spec-task>
      </section>
    </main></body></html>`,
  );
}

describe('git trailers · US2 — Assisted-by (spec 027)', () => {
  it('T-200/SC-003: an AI-coupled verb carries Assisted-by: <model>; a deterministic verb carries none', async () => {
    repo = createTmpGitRepo();
    await repo.git('commit', '--allow-empty', '-m', 'seed');
    seedSpec(repo, 'Brian Corbin · @briancorbinxyz', '—');
    repo.writeFile('spectastic.json', JSON.stringify({ git: { auto: 'commit', trailers: 'on' } }));

    // AI-coupled: plan invoked the (stub) provider → Assisted-by: stub-model.
    const plan = await repo.runVerb(['plan', '027-demo'], {
      env: { SPECTASTIC_AI_STUB: PLAN_STUB },
    });
    expect(plan.code, `stderr: ${plan.stderr}`).toBe(0);
    expect(await repo.git('log', '-1', '--format=%B')).toContain('Assisted-by: stub-model');

    // Deterministic: implement ticks a checkbox with no AI involvement → no Assisted-by.
    seedTasks(repo);
    const impl = await repo.runVerb(['implement', 'T-001']);
    expect(impl.code, `stdout: ${impl.stdout}\nstderr: ${impl.stderr}`).toBe(0);
    expect(await repo.git('log', '-1', '--format=%B')).not.toContain('Assisted-by');
  });

  it('T-201/SC-004: no commit carries an AI identity as Author/Co-authored-by/Reviewed-by/Acked-by', async () => {
    repo = createTmpGitRepo();
    await repo.git('commit', '--allow-empty', '-m', 'seed');
    seedSpec(repo, 'Brian Corbin · @briancorbinxyz', 'Jane · @jane');
    repo.writeFile('spectastic.json', JSON.stringify({ git: { auto: 'commit', trailers: 'on' } }));

    const r = await repo.runVerb(['plan', '027-demo'], {
      env: { SPECTASTIC_AI_STUB: PLAN_STUB },
    });
    expect(r.code, `stderr: ${r.stderr}`).toBe(0);

    const body = await repo.git('log', '-1', '--format=%B');
    // The model appears only on Assisted-by; never on a human-attribution line.
    const humanLines = body.split('\n').filter((l) => /^(Author|Co-authored-by|Reviewed-by|Acked-by):/.test(l));
    expect(humanLines.length).toBeGreaterThan(0);
    for (const line of humanLines) expect(line).not.toContain('stub-model');
    expect(body).toContain('Assisted-by: stub-model');
  });
});

describe('git trailers · US3 — Acked-by (spec 027)', () => {
  it('T-300/FR-007: an apply commit carries Acked-by from the proposal dispositioner', async () => {
    repo = createTmpGitRepo();
    await repo.git('commit', '--allow-empty', '-m', 'seed');
    repo.writeFile('spectastic.json', JSON.stringify({ git: { auto: 'commit', trailers: 'on' } }));

    // An accepted spec with a target requirement + a changelog for apply to append to.
    mkdirSync(join(repo.dir, 'specs', '027-demo', 'changes', '2026-06-30-acked'), { recursive: true });
    writeFileSync(
      join(repo.dir, 'specs', '027-demo', 'spec.html'),
      `<!doctype html><html><body><main>
        <p class="small-caps">Specification · 027-demo</p>
        <spec-meta><b>Status</b><span><spec-status value="accepted">Accepted</spec-status></span><b>Owner</b><span>Owner Person · @owner</span></spec-meta>
        <spec-requirement id="FR-001" priority="should"><p>Original.</p></spec-requirement>
        <spec-changelog><ol><li><time datetime="2026-06-30">2026-06-30</time><span>seed</span></li></ol></spec-changelog>
      </main></body></html>`,
    );
    // An approved proposal whose risk was dispositioned by Alice (by=).
    writeFileSync(
      join(repo.dir, 'specs', '027-demo', 'changes', '2026-06-30-acked', 'proposal.html'),
      `<!doctype html><html><body><main>
        <spec-change id="2026-06-30-acked" status="approved">
        <spec-delta op="modified" target="FR-001"><spec-requirement id="FR-001" priority="should"><p>Updated.</p></spec-requirement></spec-delta>
        <spec-risk-log><spec-risk target="FR-001" status="mitigated" by="Alice Acker · @alice"><p class="claim">handled</p></spec-risk></spec-risk-log>
        </spec-change>
      </main></body></html>`,
    );

    const r = await repo.runVerb(['apply', '027-demo', '2026-06-30-acked']);
    expect(r.code, `stdout: ${r.stdout}\nstderr: ${r.stderr}`).toBe(0);

    const body = await repo.git('log', '-1', '--format=%B');
    expect(body).toContain('Acked-by: Alice Acker · @alice');
    expect(body).toMatch(/Refs:/); // provenance to the archived proposal
  });
});
