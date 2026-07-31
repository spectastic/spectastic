export const meta = {
  name: 'hands-off',
  description:
    'Drive an approved spec through design→tasks→implement→verify unattended — the 037 Workflow home. Shares runPipeline with the CLI by invoking `spectastic run`.',
  whenToUse: 'Submit an approved spec and walk away, on the Claude Workflow surface.',
  phases: [{ title: 'Run' }],
};

// The Workflow home (spec 037 FR-008 / US4). It runs the SAME pipeline as the CLI
// home by invoking `spectastic run` — the decider is convened per decision inside
// runPipeline (via decideChoice), so both homes share one code path (plan D-001).
// Pass args: { specId, decider?='agent', effort?, checkpoints?='minimal' }.
phase('Run');

const specId = args?.specId;
if (!specId) throw new Error('hands-off: pass { specId } in args');
const decider = args?.decider ?? 'agent';
const checkpoints = args?.checkpoints ?? 'minimal';
const effortFlag = args?.effort ? ` --effort=${args.effort}` : '';

log(`hands-off: running ${specId} (decider=${decider}, checkpoints=${checkpoints})`);

const result = await agent(
  [
    `Run the spectastic hands-off pipeline for the approved spec "${specId}".`,
    `Execute exactly this from the repo root and nothing else:`,
    ``,
    `  spectastic run ${specId} --decider=${decider} --checkpoints=${checkpoints}${effortFlag} --yes`,
    ``,
    `The CLI convenes the Decider per decision (role=${decider}) and drives`,
    `design → tasks → implement → verify with validate between steps. Report the final`,
    `"run ${specId}: completed|halted — ran [...]" line and any halt reason verbatim.`,
  ].join('\n'),
  { label: `run:${specId}` },
);

return result;
