/**
 * Per-run cost budget for the hands-off pipeline (spec 040-run-budget).
 *
 * A `BudgetTracker` accumulates the run's estimated output-token spend and derives
 * a `phase()`: `normal` below 80% of the ceiling, `degrade` at ≥ 80% (the
 * REQ-FORMAT-004 amber band), `halt` at ≥ 100%. `degradeEffort` steps one band
 * down the 034 effort ladder (floor-clamped), so a degraded run convenes fewer
 * voters. `budgeted(ai, tracker)` wraps a provider so every response records its
 * estimated tokens. All additive over 037's runPipeline — no budget ⇒ `normal`.
 *
 * Spend is estimated from output length (≈ chars ÷ 4) because the AIProvider
 * reports no token usage today (D-001); exact usage is a deferred follow-up.
 */

import type { EffortLevel } from '../decider/types.js';
import type { AIProvider, ChatOpts, Question, SubagentOpts, SubagentResult } from '../types.js';

const ORDER: readonly EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const DEGRADE_AT = 0.8;

export type BudgetPhase = 'normal' | 'degrade' | 'halt';

/** Estimate output tokens from text length (≈ 4 chars/token). Deterministic (NFR-001). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Lower an effort by one band down the 034 ladder, clamped at the floor (FR-002). */
export function degradeEffort(base: EffortLevel, floor: EffortLevel = 'low'): EffortLevel {
  const i = ORDER.indexOf(base);
  if (i < 0) return base;
  const fi = Math.max(0, ORDER.indexOf(floor));
  return ORDER[Math.max(fi, i - 1)]!;
}

export class BudgetTracker {
  /** Estimated output tokens spent so far. */
  public spent = 0;
  /** The ceiling in output tokens; undefined/0 = unbounded (always `normal`). */
  constructor(public readonly ceiling?: number) {}

  /** Record a model response's estimated tokens against the budget. */
  record(text: string): void {
    this.spent += estimateTokens(text);
  }

  /** Where the run sits relative to the ceiling (FR-001). */
  phase(): BudgetPhase {
    if (!this.ceiling || this.ceiling <= 0) return 'normal';
    const ratio = this.spent / this.ceiling;
    if (ratio >= 1) return 'halt';
    if (ratio >= DEGRADE_AT) return 'degrade';
    return 'normal';
  }
}

/** Wrap a provider so every chat/ask/subagent response records its spend (D-003). */
export function budgeted(ai: AIProvider, tracker: BudgetTracker): AIProvider {
  return {
    model: ai.model,
    async chat(prompt: string, opts?: ChatOpts): Promise<string> {
      const out = await ai.chat(prompt, opts);
      tracker.record(out);
      return out;
    },
    async ask<T extends Record<string, string>>(questions: ReadonlyArray<Question>): Promise<T> {
      const out = await ai.ask<T>(questions);
      tracker.record(JSON.stringify(out));
      return out;
    },
    async subagent(prompt: string, opts?: SubagentOpts): Promise<SubagentResult> {
      const out = await ai.subagent(prompt, opts);
      tracker.record(out.output);
      return out;
    },
  };
}
