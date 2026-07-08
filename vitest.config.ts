import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts'],
    reporters: ['default'],
    // The integration tier spawns real git + CLI processes (git/git-trailers/
    // init/init-tools). Under the full suite's parallel load those exceed the
    // 5 s default, so give them headroom (spec 031-init-tools T-903).
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
