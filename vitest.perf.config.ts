import { defineConfig } from 'vitest/config';

/**
 * NFR-001's timing gate, run alone.
 *
 * The assertion and the 100ms budget live in the test file and are unchanged
 * by this config — all it does is guarantee nothing else is running while the
 * measurement is taken. The main suite excludes this file for the same reason
 * (see vitest.config.ts): a wall-clock measurement taken inside a parallel
 * pool reports the runner's load rather than validate()'s cost.
 */
export default defineConfig({
  test: {
    include: ['packages/schema/test/perf.test.ts'],
    reporters: ['default'],
    fileParallelism: false,
  },
});
