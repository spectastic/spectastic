import { Command } from 'commander';
import { registerApply } from './commands/apply.js';
import { registerChangeRisk } from './commands/change-risk.js';
import { registerCorpus } from './commands/corpus.js';
import { registerCourse } from './commands/course.js';
import { registerDesign } from './commands/design.js';
import { registerEnforce } from './commands/enforce.js';
import { registerExplore } from './commands/explore.js';
import { registerGitignore } from './commands/gitignore.js';
import { registerContract } from './commands/contract.js';
import { registerOwner } from './commands/owner.js';
import { registerTestTags } from './commands/testtags.js';
import { registerVerifyExec } from './commands/verify-exec.js';
import { registerUnits } from './commands/units.js';
import { registerId } from './commands/id.js';
import { registerImplement } from './commands/implement.js';
import { registerInit } from './commands/init.js';
import { registerOrder } from './commands/order.js';
import { registerAdrs } from './commands/adrs.js';
import { registerVerdict } from './commands/verdict.js';
import { registerPrinciples } from './commands/principles.js';
import { registerPropose } from './commands/propose.js';
import { registerRun } from './commands/run.js';
import { registerSpec } from './commands/spec.js';
import { registerTasks } from './commands/tasks.js';
import { registerTriage } from './commands/triage.js';
import { registerValidate } from './commands/validate.js';
import { registerVerify } from './commands/verify.js';
import { registerVisual } from './commands/visual.js';
import { cliVersion } from './version.js';

/**
 * @spectastic/cli entry point.
 *
 * Per FR-001 of specs/002-validate-cli/spec.html: no args → print
 * usage and exit 2. With args, parse via commander and dispatch.
 */

const program = new Command();
program
  .name('spectastic')
  .description(
    'Single-file HTML spec tooling: bootstrap a project with `init`; validate spec-html artifacts with `validate`; triage defects into structured cards with `triage`.',
  )
  .version(cliVersion())
  // Per-run model override (spec 044-verb-model-policy, Tier D / FR-006). A legal
  // tier alias the AI-coupled verbs resolve to; the most-specific per-run override,
  // above SPECTASTIC_MODEL, project config, and the per-verb map.
  .option('--model <tier>', 'model tier for AI verbs (opus | sonnet | haiku | inherit)');

// The flag is the top per-run override; surface it to createAIProvider via the
// env it already reads, so no thread-through every command action is needed.
// A flag beats a pre-existing SPECTASTIC_MODEL (both are per-run, the flag is
// the more explicit one).
program.hook('preAction', (thisCommand) => {
  const model = thisCommand.opts().model as string | undefined;
  if (model) process.env.SPECTASTIC_MODEL = model;
});

registerInit(program);
registerValidate(program);
registerTriage(program);
registerPrinciples(program);
registerTasks(program);
registerApply(program);
registerCourse(program);
registerSpec(program);
registerDesign(program);
registerPropose(program);
registerImplement(program);
registerVerify(program);
registerVisual(program);
registerId(program);
registerContract(program);
registerEnforce(program);
registerUnits(program);
registerTestTags(program);
registerVerifyExec(program);
registerOwner(program);
registerGitignore(program);
registerOrder(program);
registerAdrs(program);
registerVerdict(program);
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
