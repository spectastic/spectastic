import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { GitWorktreeSandbox } from '@spectastic/core/coding/worktree';
import { ClaudeCodeAgent } from '../src/adapters/claude-code.js';

/**
 * SC-004 — the real tool-using adapter performs a genuine edit. LOCAL-ONLY: it
 * invokes the real `claude` CLI (cost + auth), so it self-skips unless
 * SPECTASTIC_CODING_SMOKE=1 is set. CI never runs it (NFR-001); the drain logic
 * and worktree isolation are covered deterministically by the core stub tests.
 */

const RUN = process.env['SPECTASTIC_CODING_SMOKE'] === '1';

describe.skipIf(!RUN)('coding-agent runtime — real adapter smoke (038 SC-004, local-only)', () => {
  it('claude performs a real edit inside the worktree and reports the change', async () => {
    // Run against this repo's HEAD; the worktree isolates the edit, discarded after.
    const sandbox = new GitWorktreeSandbox();
    const handle = await sandbox.create(process.cwd());
    try {
      const report = await new ClaudeCodeAgent().perform({
        taskId: 'SMOKE-1',
        title: 'create a marker file',
        path: 'smoke-marker.test.ts',
        cwd: handle.dir,
        tasksHtml: '',
      });
      expect(report.status).toBe('done');
      expect(report.filesChanged.length).toBeGreaterThan(0);
      // The edit lives in the worktree, not the primary tree.
      const marker = `${handle.dir}/smoke-marker.test.ts`;
      if (existsSync(marker)) {
        expect((await readFile(marker, 'utf8')).length).toBeGreaterThan(0);
      }
    } finally {
      await handle.discard();
      await rm(`${process.cwd()}/smoke-marker.test.ts`, { force: true });
    }
  }, 20 * 60 * 1000);
});
