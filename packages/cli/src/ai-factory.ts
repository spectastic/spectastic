import { execFileSync } from 'node:child_process';
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
  /**
   * Detect whether a keyless in-host `claude` CLI is available (spec 019
   * NFR-003 / D-006). Host-pluggable, not hard-wired — override for tests
   * or a non-Claude host; defaults to probing PATH via `claude --version`.
   */
  detectClaudeCli?: () => boolean;
}

/**
 * Thrown by {@link createAIProvider} when none of the three rungs — the CI
 * stub, an explicit key, or a keyless in-host CLI — are available. Distinct
 * from `ClaudeProviderError` (which the raw SDK-backed constructor throws)
 * so a caller can distinguish "no provider was even attempted" from
 * "the provider attempt failed"; the message itself is the actionable text
 * (spec 019 NFR-003 — never a raw provider stack trace).
 */
export class AIProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIProviderUnavailableError';
  }
}

/** Default `detectClaudeCli`: probe PATH by invoking `claude --version`. */
function defaultDetectClaudeCli(): boolean {
  try {
    execFileSync('claude', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
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
 * **The keyless in-host rung is `course`-only** (spec 019 NFR-003, D-006).
 * Every other AI-coupled verb's own command doc states the standing contract
 * verbatim: "The CLI requires ANTHROPIC_API_KEY... the slash-command path
 * uses the in-host Claude session and needs no key" — those verbs' slash
 * commands never shell out to this CLI for their AI step, so their *CLI*
 * dispatch (CI/scripted use) staying key-required is intentional, not a gap.
 * `course` is the one documented exception: its slash command *delegates*
 * verification to this CLI (T-004's deep dive), which is exactly why NFR-003
 * scopes the fix to "the course verb's AI-coupled verification" alone.
 * Widening the rung to every verb was tried and reverted — it silently
 * bypassed that documented contract on any host with `claude` on PATH,
 * breaking the CLI integration tests that pin it (`plan`/`spec`/`propose`/
 * `triage`/`tasks`/`principles` all assert "no key → immediate, actionable
 * failure" as their proof that CLI wiring reaches the AI layer at all).
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
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (apiKey) {
    const model = resolveProviderModel(opts);
    const { ClaudeProvider } = await import('@spectastic/core/providers/claude');
    return new ClaudeProvider({ model });
  }
  if (opts.verb === 'course') {
    const detectClaudeCli = opts.detectClaudeCli ?? defaultDetectClaudeCli;
    if (detectClaudeCli()) {
      const { ClaudeCliProvider } = await import('@spectastic/core/providers/claude-cli');
      return new ClaudeCliProvider();
    }
    throw new AIProviderUnavailableError(
      'No AI provider is available. Set ANTHROPIC_API_KEY, or run inside a host with the `claude` CLI on PATH (e.g. Claude Code), or set SPECTASTIC_AI_STUB for a deterministic CI stub.',
    );
  }
  // Every other verb: unchanged pre-019 behaviour — construct ClaudeProvider,
  // which throws its own actionable ClaudeProviderError if no key is set.
  const model = resolveProviderModel(opts);
  const { ClaudeProvider } = await import('@spectastic/core/providers/claude');
  return new ClaudeProvider({ model });
}
