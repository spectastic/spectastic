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
    .action(
      async (
        descArg: string | undefined,
        opts: { spec?: string; mode?: 'single' | 'list'; format: string },
      ) => {
        const [{ triageCommand }, { ClaudeProvider }, { nodeFs }] = await Promise.all([
          import('@spectastic/core/commands/triage'),
          import('@spectastic/core/providers/claude'),
          import('@spectastic/core/providers/node-fs'),
        ]);

        const description = descArg ?? (await readStdin());
        if (!description.trim()) {
          process.stderr.write('triage: no description provided (arg or stdin).\n');
          process.exit(2);
        }

        const ai = new ClaudeProvider();
        const ctx = { cwd: process.cwd(), fs: nodeFs, ai };

        const input: Parameters<typeof triageCommand>[0] = {
          description,
          ...(opts.spec ? { specId: opts.spec } : {}),
          ...(opts.mode ? { mode: opts.mode } : {}),
        };

        const result = await triageCommand(input, ctx);

        if (opts.format === 'json') {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        } else {
          process.stdout.write(humanFormat(result.cards));
        }
        process.exit(0);
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
