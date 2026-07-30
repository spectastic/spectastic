/**
 * Triage a defect or list of defects into structured cards.
 *
 * Canonical procedure: commands/spectastic.triage.md (consumed by the
 * /spectastic.triage slash command). The slash command runs in-LLM
 * inside Claude Code; this kernel function exposes the same logic to
 * standalone CLI / MCP / VS Code surfaces. Per 006 FR-008 the markdown
 * remains the source of truth; this docblock points back.
 *
 * Implements FR-004 + FR-005 of specs/007-core-triage/spec.html.
 *
 * Both modes:
 *   - single-card: caller passes specId; result.cards has one TriageCard
 *     bound to that spec's triage-log.html.
 *   - list-intake: detected via the heuristic (per D-006); result.cards
 *     has one per item, each independently classified into one of the
 *     eight layers per FR-009. Per spec 032-triage-fanout the list branch
 *     classifies items CONCURRENTLY (bounded fan-out, input-ordered), with a
 *     consolidated post-pass gate — a drop-in speedup with identical output.
 *
 * The kernel returns structured cards and does NOT hard-code destination
 * paths (FR-010). The caller routes each card based on its layer:
 *   - diagnostic layers (spec / plan / implementation / cross-spec /
 *     principles / platform) → specs/<spec-id>/triage-log.html
 *   - routing exits (just-do / defer) → inbox.html
 */

import { resolveDecider } from '../decider/index.js';
import { detectMode } from '../helpers/detect-mode.js';
import { applyLayer, classifyItem, escalateLayer, formatId } from '../triage/classify.js';
import { triageFanout } from '../triage/fanout.js';
import type { KernelContext, TriageInput, TriageResult } from '../types.js';

export async function triageCommand(input: TriageInput, ctx: KernelContext): Promise<TriageResult> {
  if (!ctx.ai) {
    throw new Error('triageCommand requires ctx.ai (an AIProvider); got undefined');
  }
  const mode = input.mode ?? detectMode(input.description);

  // Resolve the hedge-gate decider (spec 036): flag/config → role, default human
  // (parity). Effort sizes a panel gate.
  const gateCfg = resolveDecider(
    undefined,
    {
      ...(input.decider ? { role: input.decider } : {}),
      ...(input.effort && input.effort !== 'auto' ? { effort: input.effort } : {}),
    },
    'human',
  );

  if (mode === 'single') {
    // Classify + gate recombined so single-item behaviour is unchanged (032 D-003).
    const r = await classifyItem(input, ctx.ai, 'single');
    const draft =
      r.status === 'ok'
        ? r.draft
        : applyLayer(
            r.draft,
            await escalateLayer(input.description, r.hedgedFrom ?? r.draft.layer, ctx.ai, gateCfg),
            r.deferTo,
          );
    const id = formatId(draft.layer, input.startingIdT ?? 0, input.startingIdI ?? 0, 1);
    return { cards: [{ ...draft, id }] };
  }

  const items = splitList(input.description);
  const cards = await triageFanout(items, input, ctx.ai, {
    ...(input.concurrency === undefined ? {} : { concurrency: input.concurrency }),
    ...(input.backend === undefined ? {} : { backend: input.backend }),
    decider: gateCfg,
  });
  return { cards };
}

function splitList(description: string): string[] {
  // Newline-separated takes precedence; fall back to comma / semicolon.
  const lines = description
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/^\s*[-*•]\s*/, '')
        .replace(/^\s*\d+[.)]\s*/, '')
        .trim(),
    )
    .filter((l) => l.length > 0);
  if (lines.length >= 2) return lines;
  return description
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export { mapPool } from '../helpers/map-pool.js';
export type { ClassifyResult, ClassifyStatus } from '../triage/classify.js';
export { classifyItem } from '../triage/classify.js';
export type { FanoutOpts } from '../triage/fanout.js';
// Re-exported for spec 032's fan-out tests and any surface that drives the
// engine directly (the shared classification core stays in ../triage/).
export { DEFAULT_CONCURRENCY, triageFanout } from '../triage/fanout.js';
