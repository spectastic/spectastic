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

/**
 * Where a `T-NNN` resolved to (090 REQ-TOOL-006). `ambiguous` is the one
 * genuinely dangerous case: the id names both an unchecked task and an open
 * triage card, and picking either silently would be the wrong one half the
 * time.
 */
export type ResolvedTarget =
  | { kind: 'task'; id: string }
  | { kind: 'triage'; id: string }
  | { kind: 'just-do'; id: string }
  | { kind: 'spec' }
  | { kind: 'ambiguous'; id: string };

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
  const resolved = resolveTarget(input.target, {
    ...(input.tasksHtml !== undefined ? { tasksHtml: input.tasksHtml } : {}),
    ...(input.triageHtml !== undefined ? { triageHtml: input.triageHtml } : {}),
  });

  if (resolved.kind === 'ambiguous') {
    throw new Error(
      `implementCommand: "${resolved.id}" is ambiguous — it names both an unchecked task and an open ` +
        `triage card. Use "task:${resolved.id}" or "triage:${resolved.id}" to disambiguate.`,
    );
  }

  if (resolved.kind === 'task') {
    if (!input.tasksHtml) throw new Error('implementCommand: target is a task ID but tasksHtml is undefined');
    const re = new RegExp(TASK_TICK_RE.source.replace('{TARGET}', escapeRegex(resolved.id)));
    if (!re.test(input.tasksHtml)) {
      throw new Error(`implementCommand: task ${resolved.id} not found (or already ticked) in tasksHtml`);
    }
    const ticked = input.tasksHtml.replace(re, '$1 checked');
    const remainingUnchecked = (ticked.match(UNCHECKED_RE) ?? []).length;
    const flipPromptFired = remainingUnchecked === 0 && !!input.specHtml && DRAFT_STATUS_RE.test(input.specHtml);
    return {
      ticked: { kind: 'task', id: resolved.id, file: 'tasks.html' },
      remainingUnchecked,
      flipPromptFired,
    };
  }

  if (resolved.kind === 'just-do') {
    if (!input.inboxHtml) throw new Error('implementCommand: target is an inbox ID but inboxHtml is undefined');
    const re = new RegExp(INBOX_TICK_RE.source.replace('{TARGET}', escapeRegex(resolved.id)));
    if (!re.test(input.inboxHtml)) {
      throw new Error(`implementCommand: inbox card ${resolved.id} not found in inboxHtml`);
    }
    // Inbox cards don't drive bundle flips (per REQ-LIFECYCLE-005).
    return {
      ticked: { kind: 'just-do', id: resolved.id, file: 'inbox.html' },
      remainingUnchecked: 0,
      flipPromptFired: false,
    };
  }

  if (resolved.kind === 'triage') {
    return dispatchTriageCard(resolved.id, input.triageHtml);
  }

  throw new Error(
    `implementCommand: target "${input.target}" is not a recognised T-NNN or I-NNN. (Spec-id resolution requires the caller to scan tasks.html for the first unchecked task and pass its T-NNN.)`,
  );
}

/**
 * Validate and close a dispatched triage card (090 REQ-TOOL-005, T-203/T-204).
 * Extracted from `implementCommand` to keep its own branching flat; this is
 * the one branch with a real gate (dispatchable) and a real refusal message,
 * not just a tick.
 *
 * Closing here is the mechanical half only — `data-status="done"` flipped in
 * the returned `closedTriageHtml`. The `<dt>Fixed</dt>` row recording what
 * shipped is free-text the calling session authors, the same split every
 * other card-closing in this project already uses; a pure function cannot
 * synthesize prose about what a fix actually did.
 */
function dispatchTriageCard(id: string, triageHtml: string | undefined): ImplementResult {
  if (!triageHtml) throw new Error('implementCommand: target is a triage card but triageHtml is undefined');
  const card = readOpenTriageCards(triageHtml).find((c) => c.id === id);
  if (!card) throw new Error(`implementCommand: triage card ${id} not found (or already closed) in triageHtml`);
  if (!card.dispatchable) {
    const regen = card.regenResult ?? 'absent';
    throw new Error(
      `implementCommand: "${id}" is not dispatchable — layer="${card.layer}", regen=${regen}. ` +
        `090 REQ-TOOL-005 only dispatches layer="implementation" with a passing regeneration result; route this ` +
        `card through /spectastic.propose or a new spec instead.`,
    );
  }
  const re = new RegExp(INBOX_TICK_RE.source.replace('{TARGET}', escapeRegex(id)));
  if (!re.test(triageHtml)) {
    // readOpenTriageCards found it but the attribute-anchored tick regex
    // didn't — a malformed card (attrs split across a line the parser
    // tolerates but the tick regex doesn't). Fail loudly rather than
    // silently skip the close.
    throw new Error(`implementCommand: triage card ${id} found but could not be closed (malformed tag)`);
  }
  return {
    ticked: { kind: 'triage', id, file: 'triage-log.html' },
    closedTriageHtml: triageHtml.replace(re, '$1 data-status="done"'),
    // Cards don't drive bundle flips (per REQ-LIFECYCLE-005) — same as just-do.
    remainingUnchecked: 0,
    flipPromptFired: false,
  };
}

/**
 * Classify a target string against the tasks/triage content it can be read
 * against (090 REQ-TOOL-006, T-201). Supersedes the old shape-only
 * `classifyTarget` — that function mapped every `T-NNN` unconditionally to
 * `'task'`, which is exactly the silent-misresolution risk this closes.
 *
 * `task:T-NNN` / `triage:T-NNN` always resolve to the named kind, never
 * refused for ambiguity — the qualifier IS the disambiguation. A bare
 * `T-NNN` is `'ambiguous'` only when it names both an UNCHECKED task and an
 * OPEN triage card at once; every other combination (one candidate, no
 * candidate, a closed/ticked one) resolves exactly as `classifyTarget` did.
 */
export function resolveTarget(target: string, ctx: { tasksHtml?: string; triageHtml?: string } = {}): ResolvedTarget {
  const qualified = /^(task|triage):(.+)$/.exec(target);
  if (qualified) {
    const [, kind, id] = qualified;
    return kind === 'task' ? { kind: 'task', id: id! } : { kind: 'triage', id: id! };
  }

  if (/^I-\d+$/.test(target)) return { kind: 'just-do', id: target };
  if (!/^T-\d+$/.test(target)) return { kind: 'spec' };

  const hasUncheckedTask = ctx.tasksHtml
    ? new RegExp(TASK_TICK_RE.source.replace('{TARGET}', escapeRegex(target))).test(ctx.tasksHtml)
    : false;
  const hasOpenCard = ctx.triageHtml
    ? new RegExp(INBOX_TICK_RE.source.replace('{TARGET}', escapeRegex(target))).test(ctx.triageHtml)
    : false;

  if (hasUncheckedTask && hasOpenCard) return { kind: 'ambiguous', id: target };
  if (hasOpenCard) return { kind: 'triage', id: target };
  return { kind: 'task', id: target };
}

/** One open `<spec-triage>` card, as read from a spec's triage-log.html. */
export interface OpenTriageCard {
  id: string;
  layer: string;
  /** The card's `data-result` value, or `undefined` if absent/unparseable. */
  regenResult: string | undefined;
  /** `layer === 'implementation' && regenResult === 'pass'` — 090 REQ-TOOL-005. */
  dispatchable: boolean;
}

const TRIAGE_CARD_RE = /<spec-triage\s+([^>]*)>([\s\S]*?)<\/spec-triage>/g;
const REGEN_RESULT_RE = /<span\s+class=["']regen["'][^>]*\bdata-result=["']([^"']+)["']/;

/**
 * Read every OPEN `<spec-triage>` card from a triage-log.html (090
 * REQ-TOOL-005, T-202). Pure and read-only — same IO-free shape as
 * `implementCommand` — so the caller (CLI edge or the slash-command markdown)
 * owns finding and loading `specs/<id>/triage-log.html`.
 *
 * `dispatchable` fails safe by construction: it is only ever true when
 * `layer` reads `"implementation"` AND `regenResult` reads exactly `"pass"`.
 * An absent or unrecognised regen result computes `false`, never a guess.
 */
export function readOpenTriageCards(triageHtml: string): OpenTriageCard[] {
  const cards: OpenTriageCard[] = [];
  for (const m of triageHtml.matchAll(TRIAGE_CARD_RE)) {
    const [, attrs, body] = m;
    if (/\bdata-status=/.test(attrs!)) continue; // closed — not open work
    const id = /\bid=["']([^"']+)["']/.exec(attrs!)?.[1];
    const layer = /\blayer=["']([^"']+)["']/.exec(attrs!)?.[1];
    if (!id || !layer) continue; // malformed card — never a candidate
    const regenResult = REGEN_RESULT_RE.exec(body!)?.[1];
    cards.push({ id, layer, regenResult, dispatchable: layer === 'implementation' && regenResult === 'pass' });
  }
  return cards;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
