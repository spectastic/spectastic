/**
 * `drainTasks` — the P-7-gated coding drain (spec 038, FR-002/FR-003/FR-005).
 *
 * Walks the unchecked `<spec-task>`s in document order; for each it opens a
 * `Sandbox`, hands the task to the injected `CodingAgent` (working in the sandbox
 * dir), runs the task's verify IN the sandbox, and ticks the task ONLY when the
 * verify passes (NFR-002 — the agent's word is never trusted). A failed, blocked,
 * or no-change outcome halts the drain and returns an escalation, the sandbox
 * discarded so the primary tree is untouched (FR-004). Idempotent: it re-scans
 * from the first unchecked task, so a re-run resumes (FR-005, P-6).
 */

import { parse, findAll, getAttr, walk } from '@spectastic/schema/parser';
import type { Element } from '@spectastic/schema/parser';
import type { DrainContext, DrainInput, DrainResult, TaskOutcome, TaskWork } from './types.js';

// Mirrors the 014 implement tick: a `<spec-task id=…>` whose checkbox has no `checked`.
const FIRST_UNCHECKED =
  /<spec-task\s+id=["']([^"']+)["'][^>]*>\s*<input\s+type=["']checkbox["'](?!\s+checked)/;
const UNCHECKED_G = /<input\s+type=["']checkbox["'](?!\s+checked)/g;
// A task's declared path is a test file iff it matches this (021 FR-003 fallback pattern).
const TEST_PATH = /\.(test|spec)\.[cm]?[jt]sx?$/;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Depth-first text content of an element (whitespace-collapsed). */
function textOf(el: Element): string {
  let out = '';
  walk(el, (node) => {
    for (const child of node.childNodes) {
      if ('value' in child && typeof child.value === 'string' && !('tagName' in child)) {
        out += child.value;
      }
    }
  });
  return out.replace(/\s+/g, ' ').trim();
}

/** The `<span class="path">` text within a task, if any. */
function taskPath(task: Element): string {
  let path = '';
  walk(task, (el) => {
    if (el.tagName === 'span' && /\bpath\b/.test(getAttr(el, 'class') ?? '')) {
      path = textOf(el);
    }
  });
  return path;
}

/** The first `<strong>` text within a task — its title. */
function taskTitle(task: Element): string {
  const strong = findAll(task, 'strong')[0];
  return strong ? textOf(strong) : '';
}

interface NextTask {
  id: string;
  title: string;
  path: string;
}

/** The first unchecked task (id via the proven regex; title/path via the parser). */
export function firstUncheckedTask(tasksHtml: string): NextTask | null {
  const m = FIRST_UNCHECKED.exec(tasksHtml);
  if (!m?.[1]) return null;
  const id = m[1];
  const doc = parse(tasksHtml, 'tasks.html');
  const task = findAll(doc.ast, 'spec-task').find((t) => getAttr(t, 'id') === id);
  return {
    id,
    title: task ? taskTitle(task) : id,
    path: task ? taskPath(task) : '',
  };
}

/** Count of unchecked checkboxes remaining. */
function remaining(tasksHtml: string): number {
  return (tasksHtml.match(UNCHECKED_G) ?? []).length;
}

/** Apply the tick to a single task id (mirrors the CLI 014 persistence). */
function tickTask(tasksHtml: string, id: string): string {
  const re = new RegExp(
    `(<spec-task\\s+id=["']${escapeRegex(id)}["'][^>]*>\\s*<input\\s+type=["']checkbox["'])(?!\\s+checked)`,
  );
  return tasksHtml.replace(re, '$1 checked');
}

/** Derive a task's verify command from its declared path; null when it isn't verifiable. */
export function verifyCommandFor(path: string): string | null {
  if (!path || !TEST_PATH.test(path)) return null;
  return `vitest run ${path}`;
}

export async function drainTasks(input: DrainInput, ctx: DrainContext): Promise<DrainResult> {
  let tasksHtml = input.tasksHtml;
  const ticked: string[] = [];

  for (;;) {
    const next = firstUncheckedTask(tasksHtml);
    if (!next) break; // drained

    const verifyCommand = verifyCommandFor(next.path);
    if (!verifyCommand) {
      // Can't verify ⇒ can't honestly tick (NFR-002). Loud blocked outcome.
      const outcome: TaskOutcome = {
        taskId: next.id,
        status: 'blocked',
        verifyPassed: false,
        filesChanged: [],
        summary: `no test path — cannot derive a verify command from "${next.path || '(none)'}"`,
      };
      return {
        ticked,
        tasksHtml,
        halted: { taskId: next.id, reason: outcome.summary, outcome },
        remainingUnchecked: remaining(tasksHtml),
      };
    }

    const handle = await ctx.sandbox.create(ctx.cwd);
    const work: TaskWork = {
      taskId: next.id,
      title: next.title,
      path: next.path,
      cwd: handle.dir,
      ...(input.specHtml ? { specHtml: input.specHtml } : {}),
      ...(input.planHtml ? { planHtml: input.planHtml } : {}),
      tasksHtml,
    };

    let outcome: TaskOutcome;
    try {
      const report = await ctx.coding.perform(work);
      if (report.status === 'blocked' || report.filesChanged.length === 0) {
        outcome = {
          taskId: next.id,
          status: 'blocked',
          verifyPassed: false,
          verifyCommand,
          filesChanged: report.filesChanged,
          summary: report.summary || 'agent produced no changes',
        };
      } else {
        const verify = await ctx.verify.run(verifyCommand, handle.dir);
        outcome = {
          taskId: next.id,
          status: verify.passed ? 'done' : 'failed',
          verifyPassed: verify.passed,
          verifyCommand,
          filesChanged: report.filesChanged,
          summary: verify.passed ? report.summary : `verify failed: ${verifyCommand}`,
        };
      }
    } catch (err) {
      outcome = {
        taskId: next.id,
        status: 'failed',
        verifyPassed: false,
        verifyCommand,
        filesChanged: [],
        summary: `coding agent threw: ${(err as Error).message}`,
      };
    }

    if (!outcome.verifyPassed) {
      await handle.discard(); // primary tree untouched (FR-004)
      return {
        ticked,
        tasksHtml,
        halted: { taskId: next.id, reason: outcome.summary, outcome },
        remainingUnchecked: remaining(tasksHtml),
      };
    }

    await handle.accept(); // bring the passing changes into the primary tree
    tasksHtml = tickTask(tasksHtml, next.id);
    ticked.push(next.id);
  }

  return { ticked, tasksHtml, remainingUnchecked: remaining(tasksHtml) };
}
