/**
 * The `models` config reader (spec 044-verb-model-policy, Tier D / D-003). A
 * top-level section in the root `spectastic.json`, read synchronously, fail-fast
 * on a typo — mirroring config/decider.ts's shape. Model tier is per-VERB (a
 * different granularity than the decider's per-checkpoint role/effort), so it
 * gets its own sibling section rather than living inside `decider`.
 *
 * Absent file/section → an empty partial, so `resolveVerbModel`'s map + default
 * fallbacks apply.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isModelTier, MODEL_TIER_ALIASES, type ModelTier } from '@spectastic/core/model-policy';

export class ModelsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelsConfigError';
  }
}

/** The `models` file config — a default tier and/or a per-verb override map, all optional. */
export interface ModelsFileConfig {
  /** The tier a verb with no per-verb entry (and no `inherit` opinion) resolves to. */
  default?: ModelTier;
  /** Per-verb tier overrides, keyed by verb name. */
  verbs?: Readonly<Record<string, ModelTier>>;
}

const legal = MODEL_TIER_ALIASES.join(' | ');

/**
 * Read `<cwd>/spectastic.json` and extract the `models` section as a partial
 * config. Malformed JSON or an illegal alias throws loudly (a mistyped tier
 * should fail the run, not silently resolve to a surprising model).
 */
export function loadModelsConfig(cwd: string): ModelsFileConfig {
  let raw: string;
  try {
    raw = readFileSync(join(cwd, 'spectastic.json'), 'utf8');
  } catch {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (err) {
    throw new ModelsConfigError(`spectastic.json is not valid JSON — ${(err as Error).message}`);
  }

  const section = (parsed as { models?: unknown }).models;
  if (section === undefined || section === null) return {};
  if (typeof section !== 'object') {
    throw new ModelsConfigError('spectastic.json "models" must be an object');
  }

  const out: ModelsFileConfig = {};
  const def = (section as { default?: unknown }).default;
  if (def !== undefined) {
    if (!isModelTier(def)) {
      throw new ModelsConfigError(`models.default must be one of ${legal}`);
    }
    out.default = def;
  }

  const verbs = (section as { verbs?: unknown }).verbs;
  if (verbs !== undefined) {
    if (typeof verbs !== 'object' || verbs === null) {
      throw new ModelsConfigError('spectastic.json "models.verbs" must be an object');
    }
    const map: Record<string, ModelTier> = {};
    for (const [verb, tier] of Object.entries(verbs as Record<string, unknown>)) {
      if (!isModelTier(tier)) {
        throw new ModelsConfigError(`models.verbs.${verb} must be one of ${legal}`);
      }
      map[verb] = tier;
    }
    out.verbs = map;
  }
  return out;
}
