/**
 * The verb model policy (spec 044-verb-model-policy). The SINGLE SOURCE OF TRUTH
 * for which Claude model tier runs which verb — read by every tier: the
 * slash-command `model:` frontmatter (Tier A), the isolated subagent pins
 * (Tier C), the CLI provider wiring (Tier D), and the drift-guard validate rule
 * (FR-009). Nothing else may enumerate the legal aliases or the per-verb tiers.
 *
 * Model tier is ORTHOGONAL to the decider's effort axis (033–036): effort is how
 * many critic/voter calls run; tier is which model answers each call. This module
 * deliberately mirrors the decider's shape (a frozen per-verb `Record` like
 * `DECISION_TAXONOMY`, an `override ?? projectCfg ?? default` resolver like
 * `resolveDecider`) so the two read as one system — but stays a separate module,
 * per 036 FR-006's "one resolution path per axis, not a parallel one".
 *
 * Aliases only — never a pinned, date-suffixed model id — so the policy tracks
 * the latest model. The one place a concrete id appears is `ALIAS_TO_MODEL_ID`;
 * when the model line advances, that table is the single edit (D-007).
 */

/** The legal model-tier aliases. `inherit` = keep the host session model / CLI default. */
export const MODEL_TIER_ALIASES = ['opus', 'sonnet', 'haiku', 'inherit'] as const;
export type ModelTier = (typeof MODEL_TIER_ALIASES)[number];

/** The resolvable tiers (everything but `inherit`) → their current concrete model id. */
export const ALIAS_TO_MODEL_ID: Readonly<Record<Exclude<ModelTier, 'inherit'>, string>> =
  Object.freeze({
    opus: 'claude-opus-4-8',
    sonnet: 'claude-sonnet-5',
    haiku: 'claude-haiku-4-5',
  });

/**
 * The tier the CLI resolves to when a verb has no per-verb opinion (`inherit` or
 * an unregistered verb). Sonnet is the deliberate floor for headless runs — the
 * same downgrade the interactive host gets from the `inherit` verbs' session model.
 */
export const DEFAULT_TIER: Exclude<ModelTier, 'inherit'> = 'sonnet';

/** The refreshed provider default id, sourced from the one table (replaces the stale `claude-sonnet-4-6`). */
export const DEFAULT_MODEL_ID = ALIAS_TO_MODEL_ID[DEFAULT_TIER];

/**
 * Per-verb model tier — the single source of truth. Single-turn autonomous verbs
 * (implement/apply/tasks) take a clean turn-scoped downgrade to Sonnet; the
 * reasoning-and-interview verbs stay on the session model (`inherit`), since a
 * frontmatter override would leak across their multi-turn chat interviews anyway.
 */
export const VERB_MODEL_POLICY: Readonly<Record<string, ModelTier>> = Object.freeze({
  implement: 'sonnet',
  apply: 'sonnet',
  tasks: 'sonnet',
  spec: 'inherit',
  plan: 'inherit',
  propose: 'inherit',
  triage: 'inherit',
  explain: 'inherit',
  principles: 'inherit',
  explore: 'inherit',
});

/** True when `value` is a legal model-tier alias — the well-formedness check (FR-009). */
export function isModelTier(value: unknown): value is ModelTier {
  return typeof value === 'string' && (MODEL_TIER_ALIASES as readonly string[]).includes(value);
}

/** Resolve a tier alias to a concrete model id; `inherit` falls to the CLI default. */
export function tierToModelId(tier: ModelTier): string {
  return tier === 'inherit' ? DEFAULT_MODEL_ID : ALIAS_TO_MODEL_ID[tier];
}

/**
 * Resolve the concrete model id a CLI verb runs on, by the same precedence shape
 * the decider uses (spec FR-007): per-run override > project config > the per-verb
 * policy map > `inherit` (→ the CLI default). Returns a concrete id for
 * `ClaudeProvider`, which flows into the spec-027 `Assisted-by:` trailer.
 */
export function resolveVerbModel(
  verb: string,
  override?: ModelTier,
  projectCfg?: ModelTier,
): string {
  const tier = override ?? projectCfg ?? VERB_MODEL_POLICY[verb] ?? 'inherit';
  return tierToModelId(tier);
}
