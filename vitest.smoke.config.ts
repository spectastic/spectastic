import { defineConfig } from 'vitest/config';

/**
 * Smoke tier (local-only) per the `feedback-ai-in-ci-uses-stubs` memory: real
 * LLM calls live here, out of the default `packages/**` vitest glob, and run via
 * `pnpm test:smoke`. Each smoke test self-skips without ANTHROPIC_API_KEY, so an
 * accidental run in CI is a no-op rather than a failure.
 */
export default defineConfig({
  test: {
    include: ['test/smoke/**/*.smoke.ts'],
    testTimeout: 120_000,
    reporters: ['default'],
  },
});
