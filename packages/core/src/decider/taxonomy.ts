/**
 * The verb decision taxonomy (spec 039-verb-decision-taxonomy). Lifts each
 * generation verb's BOUNDED, verb-generic decision-phase questions out of the
 * slash-command markdown and into code, so an orchestrator (037) can answer them
 * through the Decider instead of a human. Only the decisions that are the same
 * regardless of the artifact are here; context-dependent ones (spec's
 * smallest-demoable framings, per-story priorities) stay the adaptive interview
 * (FR-004) and have no registry entry.
 *
 * Labels mirror commands/spectastic.{plan,tasks}.md verbatim — a parity test
 * (SC-003) guards the copy against drift. `answerDecisions` is a thin lookup +
 * `decideChoice` (036) delegation; it re-implements no role dispatch (FR-003).
 */

import type { AIProvider, Question } from '../types.js';
import type { DeciderConfig } from './types.js';
import { decideChoice } from './choice.js';

export const DECISION_TAXONOMY: Readonly<Record<string, ReadonlyArray<Question>>> = Object.freeze({
  plan: [
    {
      question: 'What test style should this plan commit to?',
      header: 'Test style',
      options: [
        { label: 'TDD', description: 'Tests written and failing first, then implementation.' },
        { label: 'integration-first', description: 'Integration/behaviour tests lead; units fill in.' },
        { label: 'smoke-only', description: 'A thin smoke check; heavier testing deferred.' },
      ],
    },
    {
      question: "What is this plan's risk tolerance?",
      header: 'Risk tolerance',
      options: [
        { label: 'Low', description: 'Proven path — established patterns, no unknowns.' },
        { label: 'Medium', description: 'Some unknowns — a spike or two.' },
        { label: 'High', description: 'Experimental — significant unknowns.' },
      ],
    },
  ],
  tasks: [
    {
      question: 'Which execution strategy fits this work?',
      header: 'Execution strategy',
      options: [
        { label: 'MVP-first', description: 'Ship US1 end-to-end; solo work or risky discovery.' },
        { label: 'Incremental', description: 'Story by story, each closing before the next — normal team work.' },
        { label: 'Parallel teams', description: 'Independent surfaces worked at once when staffing allows.' },
      ],
    },
  ],
});

/**
 * Answer a verb's bounded decision-phase questions through the configured Decider.
 * Returns `{}` (making no Decider call) for a verb with no registry entry — an
 * unknown verb, or one whose decisions are context-dependent (FR-005).
 */
export async function answerDecisions(
  verb: string,
  cfg: DeciderConfig,
  ai: AIProvider,
): Promise<Record<string, string>> {
  const questions = DECISION_TAXONOMY[verb];
  if (!questions || questions.length === 0) return {};
  return decideChoice(cfg, questions, ai);
}
