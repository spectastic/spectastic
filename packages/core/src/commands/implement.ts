/**
 * Implement a single task or just-do card.
 *
 * Canonical procedure: commands/spectastic.implement.md.
 *
 * This function ticks one target; it does not own the queue. Draining is the
 * caller repeating it, which is why `resolveDrainMode` below is the only part
 * of the drain default that lives in the kernel — the preference is shared,
 * the loop is not. `--phase` and `--parallel` remain carved to
 * TBD-core-implement-drain; the ImplementInput/Result shape carries a `ticks`
 * field alongside `ticked` to keep that future slice additive (014 D-008).
 *
 * Per REQ-LIFECYCLE-005: when the tick brings the tasks.html's
 * remaining-unchecked count to zero AND the spec status is Draft,
 * the kernel reports `flipPromptFired = true`. The kernel does NOT
 * auto-flip; the caller surfaces the prompt + waits for author
 * confirmation.
 */

import type { ImplementInput, ImplementResult, KernelContext } from '../types.js';

const TASK_TICK_RE = /(<spec-task\s+id=["']{TARGET}["'][^>]*>\s*<input\s+type=["']checkbox["'])(?!\s+checked)/;
const INBOX_TICK_RE = /(<spec-triage\s+id=["']{TARGET}["'])(?![^>]*\bdata-status=)/;
const UNCHECKED_RE = /<input\s+type=["']checkbox["'](?!\s+checked)/g;
const DRAFT_STATUS_RE = /<spec-status\s+value=["']draft["']/i;

/** How `implement` treats a spec-id target: empty the queue, or do one task. */
export type DrainMode = 'drain' | 'single';

/**
 * Resolve the drain preference (090 REQ-TOOL-003, change 2026-08-12-drain-all-default).
 *
 * Precedence is flag over configuration over the compiled default, and the
 * compiled default is `drain`. It lives here rather than in the CLI because a
 * second caller — the slash command, a test — needs the same answer, and two
 * places deciding it is how they come to disagree.
 *
 * Only a spec-id target has a queue to drain; an explicit `T-NNN` is one task
 * by construction and never consults this.
 */
export function resolveDrainMode(opts: { single?: boolean; drain?: boolean; config?: unknown }): DrainMode {
  if (opts.single === true) return 'single';
  if (opts.drain === true) return 'drain';
  if (opts.config === false || opts.config === 'single') return 'single';
  if (opts.config === true || opts.config === 'drain') return 'drain';
  return 'drain';
}

export async function implementCommand(input: ImplementInput, _ctx: KernelContext): Promise<ImplementResult> {
  const targetKind = classifyTarget(input.target);

  if (targetKind === 'task') {
    if (!input.tasksHtml) throw new Error('implementCommand: target is a task ID but tasksHtml is undefined');
    const re = new RegExp(TASK_TICK_RE.source.replace('{TARGET}', escapeRegex(input.target)));
    if (!re.test(input.tasksHtml)) {
      throw new Error(`implementCommand: task ${input.target} not found (or already ticked) in tasksHtml`);
    }
    const ticked = input.tasksHtml.replace(re, '$1 checked');
    const remainingUnchecked = (ticked.match(UNCHECKED_RE) ?? []).length;
    const flipPromptFired = remainingUnchecked === 0 && !!input.specHtml && DRAFT_STATUS_RE.test(input.specHtml);
    return {
      ticked: { kind: 'task', id: input.target, file: 'tasks.html' },
      remainingUnchecked,
      flipPromptFired,
    };
  }

  if (targetKind === 'just-do') {
    if (!input.inboxHtml) throw new Error('implementCommand: target is an inbox ID but inboxHtml is undefined');
    const re = new RegExp(INBOX_TICK_RE.source.replace('{TARGET}', escapeRegex(input.target)));
    if (!re.test(input.inboxHtml)) {
      throw new Error(`implementCommand: inbox card ${input.target} not found in inboxHtml`);
    }
    // Inbox cards don't drive bundle flips (per REQ-LIFECYCLE-005).
    return {
      ticked: { kind: 'just-do', id: input.target, file: 'inbox.html' },
      remainingUnchecked: 0,
      flipPromptFired: false,
    };
  }

  throw new Error(
    `implementCommand: target "${input.target}" is not a recognised T-NNN or I-NNN. (Spec-id resolution requires the caller to scan tasks.html for the first unchecked task and pass its T-NNN.)`,
  );
}

function classifyTarget(target: string): 'task' | 'just-do' | 'spec' {
  if (/^T-\d+$/.test(target)) return 'task';
  if (/^I-\d+$/.test(target)) return 'just-do';
  return 'spec';
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
