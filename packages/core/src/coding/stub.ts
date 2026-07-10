/**
 * StubCodingAgent — the deterministic, offline coding agent for CI (spec 038
 * FR-001 / NFR-001; the AI-in-CI-uses-stubs discipline). It replays a script
 * keyed by task id: for each task it writes the scripted files into the sandbox
 * `cwd` and returns the scripted report. An un-scripted task throws loudly, so a
 * fixture gap surfaces instead of a silent pass — the StubAIProvider pattern.
 *
 * The real tool-using adapter (a subprocess over the headless `claude` CLI) lives
 * in the CLI package and is exercised only by the local smoke tier.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AgentReport, CodingAgent, TaskWork } from './types.js';

/** One scripted task response. */
export interface StubTaskScript {
  status?: 'done' | 'blocked';
  /** Relative-path → file content to write into the sandbox before returning. */
  files?: Record<string, string>;
  summary?: string;
}

export class StubCodingAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StubCodingAgentError';
  }
}

export class StubCodingAgent implements CodingAgent {
  constructor(private readonly script: Record<string, StubTaskScript>) {}

  async perform(work: TaskWork): Promise<AgentReport> {
    const entry = this.script[work.taskId];
    if (!entry) {
      throw new StubCodingAgentError(
        `StubCodingAgent: no scripted response for task ${work.taskId}. Add one to the script.`,
      );
    }
    const files = entry.files ?? {};
    const changed: string[] = [];
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(work.cwd, rel);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content, 'utf8');
      changed.push(rel);
    }
    return {
      status: entry.status ?? 'done',
      filesChanged: changed,
      summary: entry.summary ?? `stub performed ${work.taskId}`,
    };
  }
}
