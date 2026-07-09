import type { Command } from 'commander';

/**
 * Register the `triage` subcommand. Wraps @spectastic/core's
 * triageCommand with shell-side concerns: reading the destination
 * file's highest existing ID, constructing a Claude provider, and
 * writing the produced cards to disk.
 *
 * Heavy deps (@anthropic-ai/sdk via @spectastic/core/providers/claude,
 * parse5 transitively via the schema package) are lazy-imported inside
 * the action so other subcommands stay light. Matches 002 D-005's
 * lazy-loading discipline and the bench's init-help-cold-start guard.
 */
export function registerTriage(program: Command): void {
  program
    .command('triage')
    .description(
      'Triage a defect (or list) into structured cards. Reads description from arg or stdin.',
    )
    .argument('[description]', 'failure description, error, stack, or list (omit to read stdin)')
    .option('--spec <spec-id>', 'spec ID for single-card mode; ignored for list-intake')
    .option('--mode <mode>', 'force "single" | "list"; default auto-detect')
    .option('--format <fmt>', 'output format: human (default) | json', 'human')
    .option('--concurrency <n>', 'list-intake fan-out cap (spec 032; default 8)')
    .option('--fanout <backend>', 'list-intake backend: "chat" (default) | "subagent" (spec 032)')
    .option('--commit', 'force a git commit for this run (overrides git.auto)')
    .option('--no-commit', 'skip the git commit for this run (overrides git.auto)')
    .action(
      async (
        descArg: string | undefined,
        opts: {
          spec?: string;
          mode?: 'single' | 'list';
          format: string;
          concurrency?: string;
          fanout?: 'chat' | 'subagent';
          commit?: boolean;
        },
      ) => {
        const [{ triageCommand }, { createAIProvider }, { nodeFs }, path] = await Promise.all([
          import('@spectastic/core/commands/triage'),
          import('../ai-factory.js'),
          import('@spectastic/core/providers/node-fs'),
          import('node:path'),
        ]);

        const description = descArg ?? (await readStdin());
        if (!description.trim()) {
          process.stderr.write('triage: no description provided (arg or stdin).\n');
          process.exit(2);
        }

        const ai = await createAIProvider();
        const ctx = { cwd: process.cwd(), fs: nodeFs, ai };

        const concurrency = opts.concurrency === undefined ? undefined : Number(opts.concurrency);
        if (concurrency !== undefined && (!Number.isFinite(concurrency) || concurrency < 1)) {
          process.stderr.write('triage: --concurrency must be a positive integer.\n');
          process.exit(2);
        }
        if (opts.fanout !== undefined && opts.fanout !== 'chat' && opts.fanout !== 'subagent') {
          process.stderr.write('triage: --fanout must be "chat" or "subagent".\n');
          process.exit(2);
        }

        const input: Parameters<typeof triageCommand>[0] = {
          description,
          ...(opts.spec ? { specId: opts.spec } : {}),
          ...(opts.mode ? { mode: opts.mode } : {}),
          ...(concurrency === undefined ? {} : { concurrency }),
          ...(opts.fanout === undefined ? {} : { backend: opts.fanout }),
        };

        const result = await triageCommand(input, ctx);

        if (opts.format === 'json') {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        } else {
          process.stdout.write(humanFormat(result.cards));
        }

        // Opt-in git layer (spec 026): single mode (--spec) scopes + stages the spec
        // dir; list-intake has no spec id → unscoped `triage:` and stages inbox.html.
        const { commitVerbAndExit } = await import('../git/index.js');
        const cwd = process.cwd();
        await commitVerbAndExit({
          verb: 'triage',
          model: ai.model, // Assisted-by (spec 027 FR-005)
          cwd,
          specId: opts.spec ?? '',
          paths: [opts.spec ? path.resolve(cwd, 'specs', opts.spec) : path.resolve(cwd, 'inbox.html')],
          subject: `${result.cards.length} card(s)`,
          ...(opts.commit === undefined ? {} : { commit: opts.commit }),
        });
      },
    );
}

function humanFormat(cards: ReadonlyArray<{ id: string; layer: string; headline: string }>): string {
  const lines: string[] = [];
  for (const c of cards) {
    lines.push(`${c.id}  ${c.layer.padEnd(15)}  ${c.headline}`);
  }
  return `${lines.join('\n')}\n`;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}
