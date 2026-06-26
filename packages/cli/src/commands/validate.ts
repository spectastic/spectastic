import type { Command } from 'commander';
import type { Finding } from '@spectastic/schema';

interface ValidateOptions {
  format: string;
  ignore?: string[];
}

/**
 * Scan `explorations/<id>/quarantine.json` markers and emit an error finding for
 * every quarantined exploration (spec 022-explore, FR-005 / D-003). This is the
 * anti-ship merge gate: it runs on EVERY validate invocation regardless of the
 * path args, so an un-graduated exploration cannot pass `validate` and therefore
 * cannot merge (SC-002). The marker is JSON, so this lives here rather than in
 * the HTML-bound schema rule registry (plan §9).
 */
async function scanQuarantineMarkers(cwd: string): Promise<Finding[]> {
  const [{ expandGlobs }, { quarantineFinding }, { readFile }] = await Promise.all([
    import('../glob.js'),
    import('@spectastic/core/commands/explore'),
    import('node:fs/promises'),
  ]);
  const markers = await expandGlobs(['explorations/*/quarantine.json']);
  const findings: Finding[] = [];
  for (const file of markers) {
    let marker: { id?: string; status?: string };
    try {
      marker = JSON.parse(await readFile(file, 'utf8')) as { id?: string; status?: string };
    } catch {
      // A present-but-unreadable marker still signals a live exploration.
      marker = { status: 'quarantined' };
    }
    const finding = quarantineFinding(marker, file);
    if (finding) findings.push(finding);
  }
  return findings;
}

/**
 * Register the `validate` subcommand. Implements FR-001, FR-002, FR-014
 * of specs/002-validate-cli/spec.html.
 *
 * Heavy dependencies (parse5 via @spectastic/schema, tinyglobby) are
 * dynamically imported inside the action so that other subcommands —
 * notably `init` — don't pay the cold-start cost on every invocation.
 * Keeps init under its <500 ms NFR.
 */
export function registerValidate(program: Command): void {
  program
    .command('validate')
    .description('Validate one or more spec-html files. Exits 0 on clean, 1 on findings, 2 on usage errors.')
    .argument('<paths...>', 'file paths or glob patterns')
    .option('-f, --format <fmt>', 'output format: human (default) | json | sarif', 'human')
    .option('-i, --ignore <patterns...>', 'additional glob patterns to exclude')
    .action(async (paths: string[], options: ValidateOptions) => {
      const [{ validateCommand }, { expandGlobs }, { humanFormatter }, { jsonFormatter }, { sarifFormatter }] =
        await Promise.all([
          import('@spectastic/core/commands/validate'),
          import('../glob.js'),
          import('../formatters/human.js'),
          import('../formatters/json.js'),
          import('../formatters/sarif.js'),
        ]);

      const files = await expandGlobs(paths, options.ignore);
      if (files.length === 0) {
        process.stderr.write('No files matched the given patterns.\n');
        process.exit(2);
      }

      const result = await validateCommand({ files }, { cwd: process.cwd() });

      if (result.exitCode === 2) {
        process.stderr.write(`${result.errorMessage ?? 'usage error'}\n`);
        process.exit(2);
      }

      // The explore anti-ship merge gate (022-explore, FR-005): always scan the
      // quarantine markers and fold their findings in, regardless of the path
      // args, so an un-graduated exploration can never pass validate.
      const quarantineFindings = await scanQuarantineMarkers(process.cwd());
      const findings = [...result.findings, ...quarantineFindings];
      const exitCode = findings.some((f) => f.severity === 'error') ? 1 : result.exitCode;

      let output: string;
      switch (options.format) {
        case 'human':
          output = humanFormatter(findings);
          break;
        case 'json':
          output = jsonFormatter(findings);
          break;
        case 'sarif':
          output = sarifFormatter(findings);
          break;
        default:
          process.stderr.write(`Unknown format "${options.format}". Use human | json | sarif.\n`);
          process.exit(2);
      }
      process.stdout.write(output);

      process.exit(exitCode);
    });
}
