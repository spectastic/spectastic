import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { drainTasks, verifyCommandFor } from '../src/coding/runtime.js';
import { StubCodingAgent } from '../src/coding/stub.js';
import type { Sandbox, SandboxHandle, VerifyResult, VerifyRunner } from '../src/coding/types.js';

/**
 * US1 (SC-001/SC-003) — the drain ticks only verify-passing tasks and halts on
 * the first failure; a "done but verify fails" outcome does NOT tick. The
 * Sandbox + VerifyRunner are faked so the drain logic is tested purely; the real
 * git worktree is covered by coding-worktree.test.ts.
 */

const tmps: string[] = [];
afterEach(async () => {
  await Promise.all(tmps.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

/** A fake sandbox: each create() is a fresh temp dir; accept/discard are recorded. */
function fakeSandbox(): Sandbox & { accepts: string[]; discards: string[] } {
  const accepts: string[] = [];
  const discards: string[] = [];
  return {
    accepts,
    discards,
    async create(): Promise<SandboxHandle> {
      const dir = await mkdtemp(join(tmpdir(), 'drain-'));
      tmps.push(dir);
      return {
        dir,
        async accept() {
          accepts.push(dir);
        },
        async discard() {
          discards.push(dir);
        },
      };
    },
  };
}

/** A fake verify: passes iff `pass(command)` is true. */
function fakeVerify(pass: (command: string) => boolean): VerifyRunner {
  return {
    async run(command: string): Promise<VerifyResult> {
      return { passed: pass(command), output: `ran ${command}` };
    },
  };
}

const task = (id: string, testPath: string): string =>
  `<spec-task id="${id}"><input type="checkbox"><div><strong>do ${id}</strong> <span class="path">${testPath}</span></div></spec-task>`;

const TASKS = (...tasks: string[]): string =>
  `<!doctype html><html lang="en"><body><main><section id="phase-us1" class="phase"><h2>US1</h2>${tasks.join('')}</section></main></body></html>`;

describe('drainTasks — verify-gated drain (038 US1)', () => {
  it('ticks every task whose verify passes and drains to zero', async () => {
    const tasksHtml = TASKS(task('T-100', 'a.test.ts'), task('T-200', 'b.test.ts'));
    const result = await drainTasks(
      { tasksHtml },
      {
        cwd: process.cwd(),
        coding: new StubCodingAgent({
          'T-100': { files: { 'a.test.ts': '// a' } },
          'T-200': { files: { 'b.test.ts': '// b' } },
        }),
        sandbox: fakeSandbox(),
        verify: fakeVerify(() => true),
      },
    );
    expect(result.ticked).toEqual(['T-100', 'T-200']);
    expect(result.halted).toBeUndefined();
    expect(result.remainingUnchecked).toBe(0);
    expect(result.tasksHtml).toContain('id="T-200"><input type="checkbox" checked');
  });

  it('halts on the first verify failure with the box left unticked', async () => {
    const tasksHtml = TASKS(task('T-100', 'a.test.ts'), task('T-200', 'b.test.ts'));
    const sandbox = fakeSandbox();
    const result = await drainTasks(
      { tasksHtml },
      {
        cwd: process.cwd(),
        coding: new StubCodingAgent({
          'T-100': { files: { 'a.test.ts': '// a' } },
          'T-200': { files: { 'b.test.ts': '// b' } },
        }),
        sandbox,
        // T-100 passes, T-200 fails.
        verify: fakeVerify((cmd) => cmd.includes('a.test.ts')),
      },
    );
    expect(result.ticked).toEqual(['T-100']);
    expect(result.halted?.taskId).toBe('T-200');
    expect(result.halted?.outcome.status).toBe('failed');
    expect(result.tasksHtml).not.toContain('id="T-200"><input type="checkbox" checked');
    // The failing task's sandbox was discarded, the passing one accepted.
    expect(sandbox.discards).toHaveLength(1);
    expect(sandbox.accepts).toHaveLength(1);
  });

  it('does NOT tick a "done but verify fails" outcome (NFR-002 — agent word not trusted)', async () => {
    const tasksHtml = TASKS(task('T-100', 'a.test.ts'));
    const result = await drainTasks(
      { tasksHtml },
      {
        cwd: process.cwd(),
        // Agent self-reports done, writes a file — but verify fails.
        coding: new StubCodingAgent({ 'T-100': { status: 'done', files: { 'a.test.ts': '// broken' } } }),
        sandbox: fakeSandbox(),
        verify: fakeVerify(() => false),
      },
    );
    expect(result.ticked).toEqual([]);
    expect(result.halted?.taskId).toBe('T-100');
    expect(result.halted?.outcome.verifyPassed).toBe(false);
  });

  it('halts blocked when the agent produces no changes', async () => {
    const tasksHtml = TASKS(task('T-100', 'a.test.ts'));
    const sandbox = fakeSandbox();
    const result = await drainTasks(
      { tasksHtml },
      {
        cwd: process.cwd(),
        coding: new StubCodingAgent({ 'T-100': { status: 'done', files: {} } }),
        sandbox,
        verify: fakeVerify(() => true),
      },
    );
    expect(result.ticked).toEqual([]);
    expect(result.halted?.outcome.status).toBe('blocked');
    // No verify run, sandbox discarded.
    expect(sandbox.discards).toHaveLength(1);
    expect(sandbox.accepts).toHaveLength(0);
  });

  it('halts blocked when a task has no test path (nothing to verify)', async () => {
    const tasksHtml = TASKS(`<spec-task id="T-100"><input type="checkbox"><div><strong>impl</strong> <span class="path">src/foo.ts</span></div></spec-task>`);
    const result = await drainTasks(
      { tasksHtml },
      {
        cwd: process.cwd(),
        coding: new StubCodingAgent({ 'T-100': { files: { 'src/foo.ts': '//' } } }),
        sandbox: fakeSandbox(),
        verify: fakeVerify(() => true),
      },
    );
    expect(result.halted?.outcome.status).toBe('blocked');
    expect(result.halted?.reason).toMatch(/no test path/);
  });

  it('resumes from the first unchecked task (idempotent, FR-005)', async () => {
    // T-100 already ticked; drain should start at T-200.
    const tasksHtml = TASKS(
      `<spec-task id="T-100"><input type="checkbox" checked><div><strong>done</strong> <span class="path">a.test.ts</span></div></spec-task>`,
      task('T-200', 'b.test.ts'),
    );
    const result = await drainTasks(
      { tasksHtml },
      {
        cwd: process.cwd(),
        coding: new StubCodingAgent({ 'T-200': { files: { 'b.test.ts': '// b' } } }),
        sandbox: fakeSandbox(),
        verify: fakeVerify(() => true),
      },
    );
    expect(result.ticked).toEqual(['T-200']);
  });
});

describe('verifyCommandFor', () => {
  it('derives vitest for a test path, null otherwise', () => {
    expect(verifyCommandFor('packages/core/test/x.test.ts')).toBe('vitest run packages/core/test/x.test.ts');
    expect(verifyCommandFor('src/x.spec.ts')).toBe('vitest run src/x.spec.ts');
    expect(verifyCommandFor('src/foo.ts')).toBeNull();
    expect(verifyCommandFor('')).toBeNull();
  });
});
