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
    'src/decider/index.ts',
    'src/model-policy/index.ts',
    'src/commands/validate.ts',
    'src/commands/triage.ts',
    'src/commands/principles.ts',
    'src/commands/tasks.ts',
    'src/commands/restore-marker.ts',
    'src/commands/apply.ts',
    'src/commands/spec.ts',
    'src/commands/plan.ts',
    'src/commands/propose.ts',
    'src/commands/implement.ts',
    'src/commands/course.ts',
    'src/commands/verify.ts',
    'src/commands/order.ts',
    'src/commands/explore.ts',
    'src/commands/graduate.ts',
    'src/providers/node-fs.ts',
    'src/providers/claude.ts',
    'src/providers/claude-cli.ts',
    'src/providers/stub.ts',
    'src/coding/types.ts',
    'src/coding/runtime.ts',
    'src/coding/stub.ts',
    'src/coding/worktree.ts',
    'src/run/types.ts',
    'src/run/pipeline.ts',
    'src/run/steps.ts',
    'src/run/budget.ts',
    'src/gitignore/apply.ts',
    'src/gitignore/entries.ts',
    'src/enforce/types.ts',
    'src/enforce/detect.ts',
    'src/enforce/policy.ts',
    'src/enforce/config.ts',
    'src/change-risk/types.ts',
    'src/change-risk/diff.ts',
    'src/change-risk/scan.ts',
    'src/change-risk/score.ts',
    'src/change-risk/config.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  treeshake: true,
});
