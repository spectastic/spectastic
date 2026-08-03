import { describe, expect, it } from 'vitest';
import { guard } from '../src/execcheck/guard.js';
import { isAddress, planFields } from '../src/execcheck/select.js';
import { checkSpec } from '../src/execcheck/run.js';
import type { CommandRunner } from '../src/execcheck/types.js';

/**
 * Spec 085 — running what was captured.
 *
 * The refusal tests come first, and they inject no runner at all. That is the
 * point of NFR-001: "refuses without spawning anything" is a structural
 * property here, not a side effect a test has to watch for.
 */

const ROOT = '/repo';

describe('the refusals @085:FR-001 @085:FR-002 @085:NFR-001 @085:T-200', () => {
  it('refuses without the invoking project\'s consent', () => {
    const r = guard({ artifactPath: 'specs/083/verify.html', projectRoot: ROOT, consented: false });
    expect(r?.kind).toBe('no-consent');
  });

  it('refuses an artifact under a dependency directory even WITH consent @085:T-211', () => {
    // The failure P-11 is protecting against: an installed bundle executing on
    // a consumer's machine. No setting may permit this.
    const r = guard({
      artifactPath: 'node_modules/@acme/pkg/specs/001/verify.html',
      projectRoot: ROOT,
      consented: true,
    });
    expect(r?.kind).toBe('dependency-path');
    expect(r?.message).toContain('somebody else');
  });

  it('refuses an artifact resolving outside the project root', () => {
    const r = guard({ artifactPath: '../elsewhere/verify.html', projectRoot: ROOT, consented: true });
    expect(r?.kind).toBe('outside-project');
  });

  it('refuses a dependency path reached by traversal, not just a literal prefix', () => {
    const r = guard({ artifactPath: 'specs/../node_modules/x/verify.html', projectRoot: ROOT, consented: true });
    expect(r?.kind).toBe('dependency-path');
  });

  it('refuses to re-enter itself, however consenting and first-party @085:FR-002', () => {
    // Found by running it: this spec's own captured entry point was
    // `verify:exec 085`, and the check executes the entry point. Each level is
    // timeout-bounded; the depth was not.
    const r = guard({ artifactPath: 'specs/085/verify.html', projectRoot: ROOT, consented: true, reentrant: true });
    expect(r?.kind).toBe('reentrant');
    expect(r?.message).toContain('recurse');
  });

  it('permits a first-party artifact with consent', () => {
    expect(guard({ artifactPath: 'specs/083/verify.html', projectRoot: ROOT, consented: true })).toBeNull();
  });

  it('cannot spawn: every refusal is decided with no runner in existence @085:T-212', async () => {
    // A runner that fails the test if it is ever reached. `checkSpec` takes one,
    // but a refusal must resolve before it can be called.
    const never: CommandRunner = () => {
      throw new Error('a guarded check spawned a process');
    };
    for (const path of ['node_modules/x/verify.html', '../outside/verify.html']) {
      const out = await checkSpec({
        specId: '083',
        artifactPath: path,
        projectRoot: ROOT,
        consented: true,
        captured: { run: 'rm -rf /' },
        runner: never,
      });
      expect(out).toHaveProperty('refusal');
    }
  });
});

describe('choosing what runs @085:FR-003 @085:FR-004 @085:T-110', () => {
  it('never plans the demo field, whatever it contains', () => {
    const { toRun } = planFields({ demo: 'npm run something', run: 'pnpm build' });
    expect(toRun.map((t) => t.field)).toEqual(['run']);
  });

  it('skips an address-shaped entry point rather than attempting it @085:T-300', () => {
    // Legitimate per 083 FR-002: where `run` already serves the feature, the
    // field holds where to go, not what to type.
    const { toRun, decided } = planFields({ exercise: 'open http://localhost:3000/settings' });
    expect(toRun).toEqual([]);
    expect(decided.find((d) => d.field === 'exercise')?.outcome).toBe('skipped');
    expect(decided.find((d) => d.field === 'exercise')?.reason).toContain('address');
  });

  it('runs a command-shaped entry point', () => {
    const { toRun } = planFields({ exercise: 'npx spectastic units' });
    expect(toRun).toEqual([{ field: 'exercise', command: 'npx spectastic units' }]);
  });

  it('recognises addresses without over-reaching', () => {
    expect(isAddress('http://localhost:3000')).toBe(true);
    expect(isAddress('open http://example.com/x')).toBe(true);
    expect(isAddress('npx spectastic owner "open the door"')).toBe(false);
  });

  it('skips every field of a suggested block @085:FR-007 @085:T-301', () => {
    const { toRun, decided } = planFields({ run: 'pnpm build', tests: 'pnpm test', verified: false });
    expect(toRun).toEqual([]);
    expect(decided.every((d) => d.outcome === 'skipped')).toBe(true);
  });

  it('marks an uncaptured field absent, which is not the same as skipped', () => {
    const { decided } = planFields({ run: 'pnpm build' });
    expect(decided.map((d) => `${d.field}:${d.outcome}`)).toEqual(['exercise:absent', 'tests:absent']);
  });
});

describe('outcomes @085:FR-005 @085:FR-006 @085:T-100', () => {
  const base = { specId: '083', artifactPath: 'specs/083/verify.html', projectRoot: ROOT, consented: true };
  const runner =
    (result: { exitCode: number; output: string; timedOut: boolean }): CommandRunner =>
    () =>
      Promise.resolve(result);

  it('passes when the command exits zero', async () => {
    const out = await checkSpec({ ...base, captured: { run: 'true' }, runner: runner({ exitCode: 0, output: '', timedOut: false }) });
    expect('verdict' in out && out.verdict.ok).toBe(true);
  });

  it('fails, names the field and keeps the output, when a command breaks @085:T-112', async () => {
    // The whole point of the feature: a structural check on the same artifact
    // still passes, because the string is present. Only running it can tell.
    const out = await checkSpec({
      ...base,
      captured: { run: 'pnpm run removed-script' },
      runner: runner({ exitCode: 1, output: 'error: no such script', timedOut: false }),
    });
    expect('verdict' in out && out.verdict.ok).toBe(false);
    const r = 'verdict' in out ? out.verdict.results.find((x) => x.field === 'run') : undefined;
    expect(r?.outcome).toBe('failed');
    expect(r?.output).toContain('no such script');
  });

  it('reports a timeout apart from a failure', async () => {
    const out = await checkSpec({
      ...base,
      captured: { tests: 'sleep 999' },
      runner: runner({ exitCode: 124, output: '', timedOut: true }),
    });
    const r = 'verdict' in out ? out.verdict.results.find((x) => x.field === 'tests') : undefined;
    expect(r?.outcome).toBe('timed-out');
  });

  it('does NOT fail a verdict on skips and absences alone @085:D-002', async () => {
    const out = await checkSpec({
      ...base,
      captured: { exercise: 'http://localhost:3000' },
      runner: runner({ exitCode: 1, output: '', timedOut: false }),
    });
    expect('verdict' in out && out.verdict.ok).toBe(true);
  });

  it('a verdict that examined nothing still reports what it did not examine', async () => {
    // Guards against the one bug that would make this check worse than
    // useless: reporting green for an artifact it never looked at.
    const out = await checkSpec({ ...base, captured: {}, runner: runner({ exitCode: 0, output: '', timedOut: false }) });
    expect('verdict' in out && out.verdict.results.every((r) => r.outcome === 'absent')).toBe(true);
  });

  it('orders results by field so two runs of an unchanged spec read identically', async () => {
    const out = await checkSpec({
      ...base,
      captured: { tests: 'a', run: 'b', exercise: 'c' },
      runner: runner({ exitCode: 0, output: '', timedOut: false }),
    });
    expect('verdict' in out && out.verdict.results.map((r) => r.field)).toEqual(['run', 'exercise', 'tests']);
  });
});
