import type { AIProvider } from '@spectastic/core';
import { isModelTier, resolveVerbModel, type ModelTier } from '@spectastic/core/model-policy';
import { loadModelsConfig, ModelsConfigError } from './config/models.js';

export interface CreateAIProviderOptions {
  /** The verb being run — selects its per-verb tier from the policy map / config. */
  verb?: string;
  /** A per-run tier override (the `--model` flag). Wins over env and config. */
  override?: string;
  /** Project root for `spectastic.json` (defaults to process.cwd()). */
  cwd?: string;
}

/**
 * Resolve the concrete model id a CLI verb runs on (spec 044-verb-model-policy,
 * Tier D). Precedence, mirroring the decider (FR-007): `--model` override >
 * `SPECTASTIC_MODEL` env > project config (`models` section) > the per-verb
 * policy map > `inherit` → the CLI default. An illegal override/env alias throws
 * fail-fast, like the config loader. Exported for focused, key-free unit tests.
 */
export function resolveProviderModel(opts: CreateAIProviderOptions = {}): string {
  const verb = opts.verb ?? '';
  const rawOverride = opts.override ?? process.env['SPECTASTIC_MODEL'];
  let override: ModelTier | undefined;
  if (rawOverride !== undefined && rawOverride !== '') {
    if (!isModelTier(rawOverride)) {
      throw new ModelsConfigError(
        `model override "${rawOverride}" is not a legal tier alias (opus | sonnet | haiku | inherit)`,
      );
    }
    override = rawOverride;
  }
  const cfg = loadModelsConfig(opts.cwd ?? process.cwd());
  const projectCfg = cfg.verbs?.[verb] ?? cfg.default;
  return resolveVerbModel(verb, override, projectCfg);
}

/**
 * Construct an AIProvider. Defaults to ClaudeProvider (on the resolved per-verb
 * model); routes to StubAIProvider when `SPECTASTIC_AI_STUB=path/to/script.json`
 * is set.
 *
 * Per the project's `feedback-ai-in-ci-uses-stubs` memory: CI integration
 * tests use the stub for determinism; real LLMs (Claude / Ollama) live in
 * a local-only `pnpm test:smoke` tier. The stub ignores the model, so model
 * config never affects a CI run (NFR-002).
 *
 * Both branches are lazy-imported so the cold-start path doesn't pay the
 * cost of `@anthropic-ai/sdk` when the user is just running `--help` or
 * a stub-routed integration test.
 */
export async function createAIProvider(opts: CreateAIProviderOptions = {}): Promise<AIProvider> {
  const stubPath = process.env['SPECTASTIC_AI_STUB'];
  if (stubPath) {
    const { StubAIProvider } = await import('@spectastic/core/providers/stub');
    return new StubAIProvider(stubPath);
  }
  const model = resolveProviderModel(opts);
  const { ClaudeProvider } = await import('@spectastic/core/providers/claude');
  return new ClaudeProvider({ model });
}
