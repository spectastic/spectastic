/**
 * `spectastic run <spec-id>` — the hands-off pipeline CLI home (spec 037).
 * Resolves the DeciderConfig (flag > project spectastic.json > default agent),
 * refuses a human decider or an unapproved spec, wires the real seams (AIProvider,
 * coding agent, worktree sandbox, verify runner), and drives runPipeline — raising
 * each checkpoint as a prompt (auto-approved with --yes on a non-TTY run).
 *
 * The Workflow home invokes this same command, so both homes share runPipeline.
 */

import type { Command } from 'commander';

export function registerRun(program: Command): void {
  program
    .command('run')
    .description('Drive an approved spec through plan→tasks→implement→verify unattended (037).')
    .argument('<spec-id>', 'the approved spec to run (e.g. 041-foo)')
    .option('--decider <role>', 'human | agent | panel (default: agent; human refused)')
    .option('--effort <level>', 'low | medium | high | xhigh | max | auto')
    .option('--checkpoints <mode>', 'minimal | each (default: minimal)', 'minimal')
    .option('-y, --yes', 'auto-approve planned checkpoints (unattended)')
    .action(async (specId: string, opts: { decider?: string; effort?: string; checkpoints?: string; yes?: boolean }) => {
      const [{ runPipeline }, { buildRunSteps }, { resolveDecider }, cfgMod, factory, aiFactory, { nodeFs }, path] =
        await Promise.all([
          import('@spectastic/core/run/pipeline'),
          import('@spectastic/core/run/steps'),
          import('@spectastic/core/decider'),
          import('../config/decider.js'),
          import('../coding-factory.js'),
          import('../ai-factory.js'),
          import('@spectastic/core/providers/node-fs'),
          import('node:path'),
        ]);

      const cwd = process.cwd();
      const specPath = path.resolve(cwd, 'specs', specId, 'spec.html');
      let specHtml: string;
      try {
        specHtml = await nodeFs.readFile(specPath, 'utf8');
      } catch {
        process.stderr.write(`run: no spec at specs/${specId}/spec.html\n`);
        process.exit(2);
      }
      // Refuse an unapproved spec (edge case): the run drives an approved spec.
      if (!/<spec-status\s+value=["']accepted["']/i.test(specHtml)) {
        process.stderr.write(`run: specs/${specId}/spec.html is not Accepted — approve the spec before running.\n`);
        process.exit(2);
      }

      const project = cfgMod.loadDeciderConfig(cwd);
      const decider = resolveDecider(
        project,
        {
          ...(opts.decider ? { role: opts.decider as 'human' | 'agent' | 'panel' } : {}),
          ...(opts.effort ? { effort: opts.effort as never } : {}),
        },
        'agent', // checkpoint default for an unattended run
      );
      if (decider.role === 'human') {
        process.stderr.write('run: decider=human cannot drive an unattended run — use agent or panel.\n');
        process.exit(2);
      }

      const checkpoints = opts.checkpoints === 'each' ? 'each' : 'minimal';
      const [coding, sandbox] = await Promise.all([factory.createCodingAgent(), factory.createSandbox()]);
      const ai = await aiFactory.createAIProvider();
      const steps = buildRunSteps(specId, {
        cwd,
        fs: nodeFs,
        ai,
        coding,
        sandbox,
        verify: factory.createVerifyRunner(),
      });

      const escalate = async (c: { phase: string; reason: string }): Promise<'approve' | 'stop'> => {
        process.stdout.write(`\n[checkpoint before ${c.phase}] ${c.reason}\n`);
        if (opts.yes) return 'approve';
        if (!process.stdin.isTTY) {
          process.stdout.write('  non-interactive without --yes → stopping at the checkpoint.\n');
          return 'stop';
        }
        const readline = await import('node:readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        return new Promise((resolve) => {
          rl.question(`  Continue past ${c.phase}? [y/N] `, (a) => {
            rl.close();
            resolve(/^y(es)?$/i.test(a.trim()) ? 'approve' : 'stop');
          });
        });
      };

      const result = await runPipeline({ specId, decider, checkpoints }, { ai, steps, escalate });

      process.stdout.write(
        `\nrun ${specId}: ${result.completed ? 'completed' : 'halted'} — ran [${result.ranSteps.join(' → ')}]\n`,
      );
      for (const [phase, d] of Object.entries(result.decisions)) {
        const pairs = Object.entries(d).map(([k, v]) => `${k}=${v}`).join(', ');
        if (pairs) process.stdout.write(`  ${phase} decisions (${decider.role}): ${pairs}\n`);
      }
      if (result.halted) {
        process.stderr.write(`  halted at ${result.halted.phase}: ${result.halted.reason}\n`);
        process.exit(1);
      }
      process.exit(0);
    });
}
