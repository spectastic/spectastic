import { defineConfig } from 'tsup';

/**
 * Multi-entry build per D-002 of specs/006-kernel-extraction/plan.html.
 *
 * Each entry becomes a distinct dist file with its own .d.ts. The
 * package.json `exports` field references each subpath, so consumers
 * importing `@spectastic/core/commands/validate` load only that verb
 * + its transitive deps (parse5 via schema). The main entry
 * (`src/index.ts`) is types-only — importing it loads zero command
 * code. The bench's init-help-cold-start scenario is the regression
 * guard for that lazy-loading discipline.
 */
export default defineConfig({
  entry: [
    'src/index.ts',
    'src/commands/validate.ts',
    'src/commands/triage.ts',
    'src/commands/principles.ts',
    'src/commands/tasks.ts',
    'src/providers/node-fs.ts',
    'src/providers/claude.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  treeshake: true,
});
