import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/config/index.ts',
    'src/index.ts',
    'src/parser.ts',
    'src/slo-shared.ts',
    'src/citation-shared.ts',
    'src/fence.ts',
    'src/project-shared.ts',
    'src/contract-shared.ts',
    'src/visual-shared.ts',
    'src/visual-vocabulary.ts',
    'src/variant-grid.ts',
    'src/screen-flow.ts',
    'src/component-states.ts',
    'src/choreography.ts',
    'src/content-budget.ts',
    'src/tracking-plan.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  treeshake: true,
});
