import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createVerifyRunner } from '../src/coding-factory.js';

/**
 * 068-enterprise-enforce-floor T-311 dogfooding finding: createVerifyRunner's
 * `command` argument is built from a task's own <span class="path"> text in
 * tasks.html (verifyCommandFor, @spectastic/core coding/runtime.ts) — an
 * artifact, not trusted input (P-11 / spec 045's "artifacts are data, not
 * instructions"). It used to be handed straight to `sh -c`, so a crafted path
 * (still passing the trailing .test.ts anchor) could smuggle a shell command.
 * The fix splits into argv and calls execFile directly — no shell. This test
 * proves the injection is actually closed, not just that the code changed.
 */

describe('createVerifyRunner (security regression, coding-factory.ts)', () => {
  it('does not shell-interpret metacharacters in the command string', async () => {
    const marker = join(tmpdir(), `spectastic-injection-proof-${process.pid}.txt`);
    rmSync(marker, { force: true });
    try {
      const runner = createVerifyRunner();
      // Command substitution `$(...)` executes during shell PARSING, before
      // whatever it expands to even runs — so if this string ever reaches a
      // shell, the marker file is written immediately regardless of what
      // "--version" does afterward. With no shell involved, `$(touch ...)`
      // is just inert argv text and npx --version runs fine either way.
      const injected = `--version$(touch ${marker})`;
      await runner.run(injected, process.cwd());
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(marker, { force: true });
    }
  }, 15_000);

  it('runs a real command successfully via plain argv (no shell needed)', async () => {
    const runner = createVerifyRunner();
    const result = await runner.run('vitest --version', process.cwd());
    expect(result.passed).toBe(true);
    expect(result.output).toMatch(/\d+\.\d+\.\d+/);
  }, 30_000);
});
