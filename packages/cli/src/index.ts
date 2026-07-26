import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { registerApply } from './commands/apply.js';
import { registerChangeRisk } from './commands/change-risk.js';
import { registerCorpus } from './commands/corpus.js';
import { registerCourse } from './commands/course.js';
import { registerEnforce } from './commands/enforce.js';
import { registerExplore } from './commands/explore.js';
import { registerGitignore } from './commands/gitignore.js';
import { registerImplement } from './commands/implement.js';
import { registerInit } from './commands/init.js';
import { registerOrder } from './commands/order.js';
import { registerPlan } from './commands/plan.js';
import { registerPrinciples } from './commands/principles.js';
import { registerPropose } from './commands/propose.js';
import { registerRun } from './commands/run.js';
import { registerSpec } from './commands/spec.js';
import { registerTasks } from './commands/tasks.js';
import { registerTriage } from './commands/triage.js';
import { registerValidate } from './commands/validate.js';
import { registerVerify } from './commands/verify.js';

/**
 * @spectastic/cli entry point.
 *
 * Per FR-001 of specs/002-validate-cli/spec.html: no args → print
 * usage and exit 2. With args, parse via commander and dispatch.
 */

// Read version from this package's package.json at runtime so `spectastic -V`
// always reports the actually-installed version. The path resolves from the
// compiled `dist/index.js` (production install) and from `src/index.ts` (dev),
// both of which sit one level under the package root.
const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
  version: string;
};

const program = new Command();
program
  .name('spectastic')
  .description(
    'Single-file HTML spec tooling: bootstrap a project with `init`; validate spec-html artifacts with `validate`; triage defects into structured cards with `triage`.',
  )
  .version(pkg.version)
  // Per-run model override (spec 044-verb-model-policy, Tier D / FR-006). A legal
  // tier alias the AI-coupled verbs resolve to; the most-specific per-run override,
  // above SPECTASTIC_MODEL, project config, and the per-verb map.
  .option('--model <tier>', 'model tier for AI verbs (opus | sonnet | haiku | inherit)');

// The flag is the top per-run override; surface it to createAIProvider via the
// env it already reads, so no thread-through every command action is needed.
// A flag beats a pre-existing SPECTASTIC_MODEL (both are per-run, the flag is
// the more explicit one).
program.hook('preAction', (thisCommand) => {
  const model = thisCommand.opts()['model'] as string | undefined;
  if (model) process.env['SPECTASTIC_MODEL'] = model;
});

registerInit(program);
registerValidate(program);
registerTriage(program);
registerPrinciples(program);
registerTasks(program);
registerApply(program);
registerCourse(program);
registerSpec(program);
registerPlan(program);
registerPropose(program);
registerImplement(program);
registerVerify(program);
registerEnforce(program);
registerGitignore(program);
registerOrder(program);
registerExplore(program);
registerRun(program);
registerChangeRisk(program);
registerCorpus(program);

if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(2);
}

try {
  await program.parseAsync(process.argv);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${msg}\n`);
  process.exit(2);
}
