/**
 * The real PipelineSteps for the hands-off run (spec 037) — thin adapters that
 * wire the verified verb kernels into the driver: each answers via the driver's
 * Decider (039), calls its kernel, writes the artifact, and returns the
 * error-severity validate findings as the gate signal (FR-001). implement runs
 * the 038 drain; verify writes verify.html.
 *
 * These adapters are fs-effectful; the driver's logic is unit-tested with fakes
 * (run-pipeline.test.ts), the adapters' shape is structurally tested, and the
 * end-to-end real-generation run is a local smoke (the AI-in-CI posture).
 */

import { join } from 'node:path';
import { validateMany } from '@spectastic/schema';
import { drainTasks } from '../coding/runtime.js';
import type { CodingAgent, Sandbox, VerifyRunner } from '../coding/types.js';
import type { AIProvider, FileSystem } from '../types.js';
import type { PipelineStep, StepOutcome } from './types.js';

export interface RunStepDeps {
  cwd: string;
  fs: FileSystem;
  ai: AIProvider;
  coding: CodingAgent;
  sandbox: Sandbox;
  verify: VerifyRunner;
}

async function readSafe(fs: FileSystem, path: string): Promise<string | undefined> {
  try {
    return await fs.readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

/** Build the ordered real steps for a spec. Each step writes its artifact and gates on validate. */
export function buildRunSteps(specId: string, deps: RunStepDeps): PipelineStep[] {
  const dir = join(deps.cwd, 'specs', specId);
  const specPath = join(dir, 'spec.html');
  const planPath = join(dir, 'design.html');
  const tasksPath = join(dir, 'tasks.html');
  const verifyPath = join(dir, 'verify.html');
  const principlesPath = join(deps.cwd, 'principles.html');

  const validateBundle = async (): Promise<string[]> => {
    const docs: { file: string; html: string }[] = [];
    for (const [name, p] of [
      ['spec.html', specPath],
      ['design.html', planPath],
      ['tasks.html', tasksPath],
      ['verify.html', verifyPath],
    ] as const) {
      const html = await readSafe(deps.fs, p);
      if (html !== undefined) docs.push({ file: `specs/${specId}/${name}`, html });
    }
    return validateMany(docs)
      .filter((f) => f.severity === 'error')
      .map((f) => `${f.rule} (${f.file}:${f.line})`);
  };

  return [
    {
      name: 'design',
      decisionVerb: 'design',
      async run({ decisions }): Promise<StepOutcome> {
        const { designCommand } = await import('../commands/design.js');
        const specHtml = await deps.fs.readFile(specPath, 'utf8');
        const principlesHtml = await readSafe(deps.fs, principlesPath);
        const existingDesign = await readSafe(deps.fs, planPath);
        const res = await designCommand(
          {
            specId,
            specHtml,
            decisions,
            ...(existingDesign ? { existingDesign } : {}),
            ...(principlesHtml ? { principlesHtml } : {}),
          },
          { cwd: deps.cwd, fs: deps.fs, ai: deps.ai },
        );
        if (res.estimabilityBlockers.length > 0) return { findings: res.estimabilityBlockers };
        await deps.fs.writeFile(planPath, res.html);
        return { findings: await validateBundle() };
      },
    },
    {
      name: 'tasks',
      decisionVerb: 'tasks',
      async run({ decisions }): Promise<StepOutcome> {
        const { tasksCommand } = await import('../commands/tasks.js');
        const res = await tasksCommand({ specPath, planPath, decisions }, { cwd: deps.cwd, fs: deps.fs, ai: deps.ai });
        await deps.fs.writeFile(tasksPath, res.html);
        return { findings: await validateBundle() };
      },
    },
    {
      name: 'implement',
      async run(): Promise<StepOutcome> {
        const tasksHtml = await deps.fs.readFile(tasksPath, 'utf8');
        const specHtml = await readSafe(deps.fs, specPath);
        const planHtml = await readSafe(deps.fs, planPath);
        const result = await drainTasks(
          {
            tasksHtml,
            ...(specHtml ? { specHtml } : {}),
            ...(planHtml ? { planHtml } : {}),
          },
          {
            cwd: deps.cwd,
            coding: deps.coding,
            sandbox: deps.sandbox,
            verify: deps.verify,
          },
        );
        await deps.fs.writeFile(tasksPath, result.tasksHtml);
        if (result.halted)
          return {
            halted: {
              taskId: result.halted.taskId,
              reason: result.halted.reason,
            },
          };
        return {};
      },
    },
    {
      name: 'verify',
      async run(): Promise<StepOutcome> {
        const { verifyCommand } = await import('../commands/verify.js');
        const res = await verifyCommand({ specId }, { cwd: deps.cwd, fs: deps.fs });
        await deps.fs.writeFile(verifyPath, res.html);
        return {};
      },
    },
  ];
}
