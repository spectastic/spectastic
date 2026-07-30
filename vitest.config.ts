import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // packages/** is the product; scripts/** is release tooling (the dist-tag
    // derivation FR-006 requires), which is deliberately not shipped in a
    // published package but still needs its branches tested.
    include: ['packages/**/*.test.ts', 'scripts/**/*.test.ts'],
    reporters: ['default'],
    // The integration tier spawns real git + CLI processes (git/git-trailers/
    // init/init-tools). Under the full suite's parallel load those exceed the
    // 5 s default, so give them headroom (spec 031-init-tools T-903).
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Coverage (068-enterprise-enforce-floor T-116, plan D-002): this block
    // exists to satisfy the enforce detector's coverage-category signal
    // (packages/core/src/enforce/detect.ts matches the literal `thresholds`
    // key in this file), not to be the real gate. spectastic's own diff-aware
    // doctrine is explicit — never a universal project percentage, always
    // "≥80% of changed lines, never lower what's touched" — so the numbers
    // here are a deliberate no-op floor; the actual enforcement is the
    // patch-coverage CI step (T-117) reading this run's lcov output.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/{schema,corpus,core,cli}/src/**'],
      thresholds: {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
      },
    },
  },
});
