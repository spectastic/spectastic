import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/parser.ts', 'src/slo-shared.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  treeshake: true,
});
