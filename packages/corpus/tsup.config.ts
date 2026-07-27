import { defineConfig } from 'tsup';

/**
 * Multi-entry build, mirroring packages/core/tsup.config.ts's pattern (006-kernel-extraction
 * D-002). Two entries for this slice: the library barrel (src/index.ts, what
 * @spectastic/core and @spectastic/cli import) and the standalone CLI entry
 * (src/cli/index.ts, what the spectastic-corpus binary runs).
 */
export default defineConfig({
  entry: ['src/index.ts', 'src/cli/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  treeshake: true,
});
