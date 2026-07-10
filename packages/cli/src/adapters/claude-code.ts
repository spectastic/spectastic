/**
 * ClaudeCodeAgent — the real tool-using coding agent (spec 038 FR-006, D-004).
 * Runs the headless `claude` CLI as a subprocess confined to the sandbox `cwd`
 * (a git worktree), then reports the files it changed by reading `git status`.
 *
 * Smoke-tier only (NFR-001): CI always uses the StubCodingAgent. The subprocess
 * mechanism is D-004's v1 choice; an in-process SDK tool-loop is the documented
 * fallback if `claude` proves unfit.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AgentReport, CodingAgent, TaskWork } from '@spectastic/core/coding/types';

const exec = promisify(execFile);

/** A generous ceiling — a coding turn can be long; the run-budget sibling bounds spend. */
const AGENT_TIMEOUT_MS = 15 * 60 * 1000;

function buildPrompt(work: TaskWork): string {
  return [
    `Implement this task in the current repository. Make the change and ensure the test passes.`,
    ``,
    `Task ${work.taskId}: ${work.title}`,
    `Primary file / test: ${work.path}`,
    ``,
    `Only edit files under this working directory. When done, the test command`,
    `\`vitest run ${work.path}\` must pass. Do not commit.`,
  ].join('\n');
}

export class ClaudeCodeAgent implements CodingAgent {
  constructor(private readonly bin: string = 'claude') {}

  async perform(work: TaskWork): Promise<AgentReport> {
    // Headless, non-interactive; edits auto-accepted inside the throwaway worktree.
    await exec(this.bin, ['-p', buildPrompt(work), '--permission-mode', 'acceptEdits'], {
      cwd: work.cwd,
      timeout: AGENT_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
    });

    // The agent's changes are whatever it left in the worktree — read them from git.
    const { stdout } = await exec('git', ['status', '--porcelain'], { cwd: work.cwd });
    const filesChanged = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.replace(/^..\s+/, ''));

    return {
      status: filesChanged.length > 0 ? 'done' : 'blocked',
      filesChanged,
      summary:
        filesChanged.length > 0
          ? `claude changed ${filesChanged.length} file(s)`
          : 'claude produced no changes',
    };
  }
}
