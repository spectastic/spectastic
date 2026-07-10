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
 * Scan the project's own command definitions (`commands/spectastic.*.md`) for the
 * structured skill-invocation metadata REQ-TOOL-004 (spec 000-spectastic) requires:
 * `triggers`, `use-when`, `sibling-boundary`. Warning findings, folded into every
 * validate run like the quarantine scan — a frontmatter/markdown check that can't
 * live in the HTML-bound schema rule registry. In a consumer project (no `commands/`
 * sources) the glob matches nothing, so it's a no-op there.
 */
async function scanSkillMetadata(): Promise<Finding[]> {
  const [{ expandGlobs }, { skillMetadataFinding }, { readFile }] = await Promise.all([
    import('../glob.js'),
    import('@spectastic/core/commands/validate'),
    import('node:fs/promises'),
  ]);
  const commandFiles = await expandGlobs(['commands/spectastic.*.md']);
  const findings: Finding[] = [];
  for (const file of commandFiles) {
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue; // an unreadable command file has nothing to shape-check
    }
    const finding = skillMetadataFinding(content, file);
    if (finding) findings.push(finding);
  }
  return findings;
}

/**
 * Scan the project's command frontmatter for a well-formed `model:` key that
 * agrees with the core policy map (spec 044-verb-model-policy, FR-009 drift-guard).
 * Error findings — the enforcement half of REQ-TOOL-004's optional-key permission —
 * folded into every validate run like the skill-metadata scan. A no-op in a
 * consumer project (no `commands/` sources).
 */
async function scanVerbModelPolicy(): Promise<Finding[]> {
  const [{ expandGlobs }, { verbModelPolicyFinding }, { readFile }] = await Promise.all([
    import('../glob.js'),
    import('@spectastic/core/commands/validate'),
    import('node:fs/promises'),
  ]);
  const commandFiles = await expandGlobs(['commands/spectastic.*.md']);
  const findings: Finding[] = [];
  for (const file of commandFiles) {
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch {
      continue; // an unreadable command file has no model: to check
    }
    const finding = verbModelPolicyFinding(content, file);
    if (finding) findings.push(finding);
  }
  return findings;
}

/**
 * Scan init-tools-managed command adapters for drift (spec 031, FR-007 / D-001).
 * When `.claude/commands` is managed (the marker is present), every source
 * `commands/spectastic.*.md` must match its installed adapter byte-for-byte; a
 * missing or divergent adapter is an error, so the pre-commit gate blocks a
 * stale-adapter commit. A no-op in an unmanaged project (no marker) — a project
 * that never ran `init --tools --commands-only` is never judged.
 */
async function scanCommandsDrift(cwd: string): Promise<Finding[]> {
  const [{ commandsDriftFinding }, { adaptersManaged, driftPairs }, { readFile }] = await Promise.all([
    import('@spectastic/core/commands/validate'),
    import('./init/adapters.js'),
    import('node:fs/promises'),
  ]);
  if (!adaptersManaged(cwd)) return [];
  const findings: Finding[] = [];
  for (const pair of driftPairs(cwd)) {
    let source: string;
    try {
      source = await readFile(pair.source, 'utf8');
    } catch {
      continue; // an unreadable source has nothing to compare against
    }
    let adapter: string | null = null;
    try {
      adapter = await readFile(pair.adapter, 'utf8');
    } catch {
      adapter = null; // missing adapter = drift
    }
    const finding = commandsDriftFinding(source, adapter, pair.rel);
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
      // The skill-metadata-shape rule (REQ-TOOL-004): warn on any command whose
      // frontmatter is missing the structured invocation keys. Warning-only, so it
      // never changes the exit code — advisory until the eval floor / hard gate land.
      const skillMetadataFindings = await scanSkillMetadata();
      // The commands-drift gate (spec 031, FR-007): a managed adapter that has
      // drifted from source is an error, so the pre-commit gate blocks it.
      const commandsDriftFindings = await scanCommandsDrift(process.cwd());
      // The verb-model-policy drift-guard (spec 044, FR-009): a command whose
      // optional model: key is not a legal alias or disagrees with the policy map
      // is an error — the enforcement REQ-TOOL-004 delegates for the permitted key.
      const verbModelPolicyFindings = await scanVerbModelPolicy();
      const findings = [
        ...result.findings,
        ...quarantineFindings,
        ...skillMetadataFindings,
        ...commandsDriftFindings,
        ...verbModelPolicyFindings,
      ];
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
