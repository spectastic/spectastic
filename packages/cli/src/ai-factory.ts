import type { AIProvider } from '@spectastic/core';

/**
 * Construct an AIProvider. Defaults to ClaudeProvider; routes to
 * StubAIProvider when `SPECTASTIC_AI_STUB=path/to/script.json` is set.
 *
 * Per the project's `feedback-ai-in-ci-uses-stubs` memory: CI integration
 * tests use the stub for determinism; real LLMs (Claude / Ollama) live in
 * a local-only `pnpm test:smoke` tier.
 *
 * Both branches are lazy-imported so the cold-start path doesn't pay the
 * cost of `@anthropic-ai/sdk` when the user is just running `--help` or
 * a stub-routed integration test.
 */
export async function createAIProvider(): Promise<AIProvider> {
  const stubPath = process.env['SPECTASTIC_AI_STUB'];
  if (stubPath) {
    const { StubAIProvider } = await import('@spectastic/core/providers/stub');
    return new StubAIProvider(stubPath);
  }
  const { ClaudeProvider } = await import('@spectastic/core/providers/claude');
  return new ClaudeProvider();
}
