/**
 * The triage list-intake fan-out engine (spec 032-triage-fanout, plan D-001).
 *
 * ONE engine, two backends: parameterized by `backend` it drives `classifyItem`
 * via `ai.chat` (CLI) or `ai.subagent` (Workflow) — same shared classification
 * core either way (spec FR-001). Three phases:
 *
 *   1. Concurrent classification through a bounded pool — results in INPUT ORDER
 *      regardless of completion order (spec FR-002, FR-007, NFR-001). Each item's
 *      classification is a total function, so a failure is a value, not a throw
 *      (spec FR-003, FR-004).
 *   2. One CONSOLIDATED gate pass, AFTER the pool drains — hedged and failed items
 *      resolve their layer via `escalateLayer`; never interleaved with the
 *      concurrent pass (spec FR-005). The hedge decision itself lives in the
 *      shared core, so it fires identically for both backends (spec FR-006, P-8).
 *   3. SINGLE-WRITER id assignment in input order — I-NNN / T-NNN counters advance
 *      once, sequentially (spec NFR-003), matching the pre-fan-out scheme exactly.
 */

import type { DeciderConfig } from '../decider/types.js';
import { mapPool } from '../helpers/map-pool.js';
import type { AIProvider, TriageCard, TriageInput } from '../types.js';
import { applyLayer, classifyItem, escalateLayer, formatId, isRoutingExit } from './classify.js';

export interface FanoutOpts {
  /** Max concurrent classifications (spec FR-007). Default 8. */
  concurrency?: number;
  /** Provider method the shared core calls (spec D-001). Default 'chat'. */
  backend?: 'chat' | 'subagent';
  /** Decider for the consolidated hedge gate (spec 036). Default human. */
  decider?: DeciderConfig;
}

export const DEFAULT_CONCURRENCY = 8;

/**
 * Classify `items` concurrently and return one card per item, in input order.
 * `base` supplies the starting IDs (startingIdT / startingIdI) the caller scanned.
 */
export async function triageFanout(
  items: readonly string[],
  base: TriageInput,
  ai: AIProvider,
  opts: FanoutOpts = {},
): Promise<TriageCard[]> {
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const backend = opts.backend ?? 'chat';

  // Phase 1 — concurrent, total classification. Results are input-ordered.
  const results = await mapPool(
    items,
    (item) => classifyItem({ ...base, description: item }, ai, 'list', backend),
    concurrency,
  );

  // Phase 2 — consolidated gate, after the pool drains. Walk in input order so
  // any ai.ask prompts are deterministic and never interleave with Phase 1.
  const drafts: Array<Omit<TriageCard, 'id'>> = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    if (r.status === 'ok') {
      drafts.push(r.draft);
    } else {
      const layer = await escalateLayer(items[i]!, r.hedgedFrom ?? r.draft.layer, ai, opts.decider);
      drafts.push(applyLayer(r.draft, layer, r.deferTo));
    }
  }

  // Phase 3 — single-writer id assignment, input order (matches the pre-fan-out
  // interleaved-counter scheme, now hoisted out of the classification loop).
  const cards: TriageCard[] = [];
  let tCount = 0;
  let iCount = 0;
  for (const draft of drafts) {
    if (isRoutingExit(draft.layer)) {
      iCount += 1;
      cards.push({
        ...draft,
        id: formatId(draft.layer, 0, base.startingIdI ?? 0, iCount),
      });
    } else {
      tCount += 1;
      cards.push({
        ...draft,
        id: formatId(draft.layer, base.startingIdT ?? 0, 0, tCount),
      });
    }
  }
  return cards;
}
