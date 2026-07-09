/**
 * The ask-shaped sibling of `decide` (spec 036-decider-choice). Where `decide`
 * runs critics/scorers, `decideChoice` answers a BOUNDED CHOICE — the shape the
 * kernel's `ai.ask` gates use (confirmRice, escalateLayer). Same roles, same
 * effort table, same guardrails; a different answer shape.
 *
 *   - human  → `ai.ask` verbatim (the unchanged default — parity is definitional);
 *   - agent  → one subagent selects an option per question;
 *   - panel  → N effort-sized subagents vote; the majority option per question
 *              wins, tie-broken to declared order (deterministic, NFR-001).
 *
 * No self-judging (spec FR-004 / 033 FR-006): decideChoice only ever runs FRESH
 * subagents against the question — it never ratifies an author's own prior output.
 */

import type { AIProvider, Question } from '../types.js';
import type { DeciderConfig } from './types.js';
import { effortToDepth } from './effort.js';
import { mapPool } from '../helpers/map-pool.js';

/** Answer a bounded-choice checkpoint by the configured role. Returns { header: chosenLabel }. */
export async function decideChoice(
  cfg: DeciderConfig,
  questions: ReadonlyArray<Question>,
  ai: AIProvider,
): Promise<Record<string, string>> {
  if (cfg.role === 'human') {
    return ai.ask<Record<string, string>>(questions);
  }
  const voters = cfg.role === 'agent' ? 1 : effortToDepth(cfg.effort).voters;
  const answers = await mapPool(
    Array.from({ length: voters }, (_, i) => i),
    () => answerOnce(questions, ai),
    voters,
  );
  return tally(questions, answers);
}

async function answerOnce(
  questions: ReadonlyArray<Question>,
  ai: AIProvider,
): Promise<Record<string, string>> {
  const res = await ai.subagent(buildChoicePrompt(questions), { task: 'decider-choice' });
  return parseChoice(res.output, questions);
}

function buildChoicePrompt(questions: ReadonlyArray<Question>): string {
  const body = questions
    .map(
      (q) =>
        `- header "${q.header}": ${q.question}\n  options: ${q.options.map((o) => `"${o.label}" (${o.description})`).join(', ')}`,
    )
    .join('\n');
  return `You are deciding bounded choices. For each decision choose exactly ONE option by its label. Return ONLY JSON mapping each header to your chosen label.\n\nDecisions:\n${body}`;
}

function parseChoice(raw: string, questions: ReadonlyArray<Question>): Record<string, string> {
  let parsed: Record<string, unknown> = {};
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const p = JSON.parse(stripped) as unknown;
    if (p && typeof p === 'object') parsed = p as Record<string, unknown>;
  } catch {
    /* fall through to defaults */
  }
  const out: Record<string, string> = {};
  for (const q of questions) {
    const val = parsed[q.header];
    const valid = typeof val === 'string' && q.options.some((o) => o.label === val);
    out[q.header] = valid ? (val as string) : q.options[0]!.label;
  }
  return out;
}

/** Majority vote per header; declared-order tie-break (first option with the max count wins). */
function tally(
  questions: ReadonlyArray<Question>,
  answers: ReadonlyArray<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of questions) {
    const counts = new Map<string, number>();
    for (const a of answers) {
      const label = a[q.header];
      if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    let best = q.options[0]!.label;
    let bestCount = -1;
    for (const o of q.options) {
      const c = counts.get(o.label) ?? 0;
      if (c > bestCount) {
        bestCount = c;
        best = o.label;
      }
    }
    out[q.header] = best;
  }
  return out;
}
