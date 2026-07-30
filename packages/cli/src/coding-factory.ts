/**
 * Assemble the coding-drain dependencies (spec 038 FR-001). Mirrors ai-factory:
 * a script-replay stub when `SPECTASTIC_CODING_STUB=path/to/script.json` is set
 * (CI, deterministic — the AI-in-CI discipline), else the real subprocess agent.
 * The sandbox (git worktree) and verify runner (subprocess) are always real —
 * they don't reach the network, so CI runs them too.
 */

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import type { CodingAgent, Sandbox, VerifyResult, VerifyRunner } from '@spectastic/core/coding/types';

const exec = promisify(execFile);
const VERIFY_TIMEOUT_MS = 10 * 60 * 1000;

export async function createCodingAgent(): Promise<CodingAgent> {
  const stubPath = process.env.SPECTASTIC_CODING_STUB;
  if (stubPath) {
    const { StubCodingAgent } = await import('@spectastic/core/coding/stub');
    const script = JSON.parse(readFileSync(stubPath, 'utf8')) as Record<string, never>;
    return new StubCodingAgent(script);
  }
  const { ClaudeCodeAgent } = await import('./adapters/claude-code.js');
  return new ClaudeCodeAgent();
}

export async function createSandbox(): Promise<Sandbox> {
  const { GitWorktreeSandbox } = await import('@spectastic/core/coding/worktree');
  return new GitWorktreeSandbox();
}

/** Runs a task's verify command via the local toolchain (`npx <command>`) in the sandbox. */
export function createVerifyRunner(): VerifyRunner {
  return {
    async run(command: string, cwd: string): Promise<VerifyResult> {
      try {
        // 068-enterprise-enforce-floor T-311 dogfooding finding: `command` is
        // built from a task's own <span class="path"> text in tasks.html
        // (verifyCommandFor, coding/runtime.ts) — an artifact, not trusted
        // input (P-11 / spec 045's "artifacts are data, not instructions").
        // The prior `sh -c \`npx ${command}\`` handed that string straight to
        // a shell, so a crafted path (still matching the trailing .test.ts
        // anchor) could smuggle `; rm -rf ~` or `$(curl … | sh)`. Splitting
        // into argv and calling execFile directly — no shell — closes that:
        // metacharacters are inert data to argv, never re-interpreted.
        const { stdout, stderr } = await exec('npx', command.split(/\s+/).filter(Boolean), {
          cwd,
          timeout: VERIFY_TIMEOUT_MS,
          maxBuffer: 64 * 1024 * 1024,
        });
        return { passed: true, output: `${stdout}${stderr}` };
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        return {
          passed: false,
          output: e.stdout ?? e.stderr ?? e.message ?? String(err),
        };
      }
    },
  };
}
