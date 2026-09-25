import { dirname, join } from 'node:path';
import type { Command } from 'commander';
import { resolveDecisionSources } from './decision-sources.js';

/**
 * Register the `decisions` command group (spec 122-decision-index-federation,
 * D-005) — `for`, `coverage`, `export`, `sync`. `for` and `coverage` are spec
 * 112-guardrail-decision-record's retrieval verb unchanged; `adrs` is kept as
 * a hidden alias forwarding to the same action functions, byte-identical, so
 * nothing that calls it today breaks. `export` and `sync` are new (spec 122).
 *
 * Deterministic, no AI — like `order`/`verify`, `for` and `coverage` run in CI
 * with no key. `export` and `sync` are filesystem-only too; `sync` is the one
 * verb in this group that reaches the network, behind a fetcher port neither
 * `for`/`coverage`/`export` import.
 */

interface ForOptions {
  for?: string[];
  log: string;
  json?: boolean;
}

/** `decisions for` / `adrs --for`: the governing-decision retrieval report. */
async function runFor(opts: ForOptions): Promise<void> {
  const [{ adrsCommand }, { nodeFs }, { resolveProjectConfig }, fsp] = await Promise.all([
    import('@spectastic/core/commands/adrs'),
    import('@spectastic/core/providers/node-fs'),
    import('@spectastic/corpus'),
    import('node:fs/promises'),
  ]);

  const cwd = process.cwd();

  if (!opts.for || opts.for.length === 0) {
    process.stderr.write('decisions: pass --for <paths...> to retrieve, or run `decisions coverage` to report.\n');
    process.exit(2);
  }

  const { project } = resolveProjectConfig(cwd);
  const paths = opts.for;
  const result = await adrsCommand({ paths, project, now: new Date() }, { cwd, fs: nodeFs });

  // Write the log artifact (retrieval is "logged"; the verdict reconstructs from disk).
  const logPath = join(cwd, opts.log);
  await fsp.mkdir(join(cwd, opts.log, '..'), { recursive: true }).catch(() => {});
  await fsp.writeFile(logPath, result.logText, 'utf8');

  if (opts.json) {
    process.stdout.write(result.logText);
  } else if (result.matches.length === 0) {
    process.stdout.write('No governance decisions govern the given paths.\n');
  } else {
    for (const m of result.matches) {
      const enf = m.decision.enforcement;
      const check = enf?.none
        ? `none (${enf.none.reason})`
        : (enf?.rules ?? []).map((r) => `${r.tool}:${r.id}`).join(', ') || '(no check)';
      process.stdout.write(
        `${m.decision.specId}/${m.decision.id}  [${m.decision.posture ?? 'block'}]  ${check}\n` +
          `  governs: ${m.matchedPaths.join(', ')}\n`,
      );
    }
  }
  process.stderr.write(`Wrote ${opts.log}\n`);
  process.exit(0);
}

/** `decisions coverage` / `adrs --coverage`: the decision-coverage report. */
async function runCoverage(): Promise<void> {
  const [{ loadDecisions, coverageReport }, { nodeFs }] = await Promise.all([
    import('@spectastic/core/commands/adrs'),
    import('@spectastic/core/providers/node-fs'),
  ]);
  const cwd = process.cwd();
  const decisions = await loadDecisions({ cwd, fs: nodeFs });
  const r = coverageReport(decisions, { now: new Date() });
  const pct = Math.round(r.proportion * 100);
  process.stdout.write(
    `decision coverage: ${r.checked}/${r.total} active decisions carry an executable check (${pct}%)\n` +
      `  excused (none-with-reason): ${r.excused}\n` +
      `  uncovered: ${r.uncovered}\n`,
  );
  for (const f of r.findings) process.stdout.write(`  warn: ${f.message}\n`);
  process.exit(0);
}

/** `decisions export [--out]` (spec FR-001): build the committed index from
 *  this project's accepted, scoped decisions and write it. */
async function runExport(opts: { out: string }): Promise<void> {
  const [{ loadDecisions }, { buildIndex }, { nodeFs }, { resolveProjectConfig }, fsp] = await Promise.all([
    import('@spectastic/core/commands/adrs'),
    import('@spectastic/core/decisions/index'),
    import('@spectastic/core/providers/node-fs'),
    import('@spectastic/corpus'),
    import('node:fs/promises'),
  ]);
  const cwd = process.cwd();
  const { project } = resolveProjectConfig(cwd);
  const decisions = await loadDecisions({ cwd, fs: nodeFs });

  let index: ReturnType<typeof buildIndex>;
  try {
    index = buildIndex(decisions, project, new Date());
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }

  const outPath = join(cwd, opts.out);
  await fsp.mkdir(dirname(outPath), { recursive: true }).catch(() => {});
  await fsp.writeFile(outPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  process.stdout.write(`Wrote ${opts.out}\n`);
  process.exit(0);
}

/** `decisions sync` (spec FR-004): fetch each declared source, validate,
 *  write the vendored copy verbatim, record the pin, report the outcome per
 *  source; a fetch/validate failure leaves the existing copy and pin
 *  untouched and makes the whole verb exit non-zero. */
async function runSync(): Promise<void> {
  const [
    { planSync },
    { decisionIndexFetcher },
    { vendoredSourcePath },
    { setDecisionSourcePin },
    { resolveProjectConfig },
    fsp,
  ] = await Promise.all([
    import('@spectastic/core/decisions/sync'),
    import('@spectastic/core/providers/decision-index-fetcher'),
    import('@spectastic/core/commands/verdict'),
    import('@spectastic/core/config/edit'),
    import('@spectastic/corpus'),
    import('node:fs/promises'),
  ]);
  const cwd = process.cwd();
  const { project } = resolveProjectConfig(cwd);
  const sources = resolveDecisionSources(cwd, project, 'decisions sync');

  if (sources.length === 0) {
    process.stdout.write('decisions sync: no sources declared under `decisions.sources` — nothing to do.\n');
    process.exit(0);
  }

  const plan = await planSync(sources, decisionIndexFetcher(cwd));

  let anyRefused = false;
  for (const result of plan) {
    if (result.outcome === 'refused') {
      anyRefused = true;
      process.stdout.write(`REFUSED  ${result.project} — ${result.reason}\n`);
      continue;
    }
    // fetched | unchanged | moved all carry pin + text — write verbatim and
    // pin every time (D-004: identical bytes on `unchanged` is a zero-line
    // diff, not a reason to skip the write; the existing copy might be
    // missing on disk even when the config's pin already agrees).
    const vendoredPath = join(cwd, vendoredSourcePath(result.project));
    await fsp.mkdir(dirname(vendoredPath), { recursive: true }).catch(() => {});
    await fsp.writeFile(vendoredPath, result.text ?? '', 'utf8');
    setDecisionSourcePin(cwd, result.project, result.pin ?? '');
    process.stdout.write(`${result.outcome.toUpperCase()}  ${result.project} — ${vendoredSourcePath(result.project)}\n`);
  }

  process.exit(anyRefused ? 1 : 0);
}

export function registerDecisions(program: Command): void {
  const decisions = program
    .command('decisions')
    .description('Publish, fetch, and query the governance decisions that scope a data store across repositories.');

  decisions
    .command('for')
    .description(
      'Find the governance decisions that govern a set of paths, in precedence order, and write a reproducible retrieval log. Deterministic, no AI.',
    )
    .option('--for <paths...>', 'code paths to find governing decisions for')
    .option('--log <path>', 'where to write the retrieval log (relative to cwd)', '.spectastic/adr-retrieval.json')
    .option('--json', 'print the retrieval log as JSON to stdout instead of a human summary')
    .action(async (opts: ForOptions) => runFor(opts));

  decisions
    .command('coverage')
    .description('Report the proportion of active decisions carrying an executable check.')
    .action(async () => runCoverage());

  decisions
    .command('export')
    .description(
      "Publish this project's accepted, scoped decisions as a hashed, committed index other repositories can federate with.",
    )
    .option('--out <path>', 'where to write the index (relative to cwd)', 'specs/decisions.json')
    .action(async (opts: { out: string }) => runExport(opts));

  decisions
    .command('sync')
    .description("Fetch each declared source's decision index and vendor a pinned copy.")
    .action(async () => runSync());

  // Hidden alias (spec 122 D-005): unchanged flags, forwards to the same
  // action functions, byte-identical output — nothing that calls `adrs` today breaks.
  program
    .command('adrs', { hidden: true })
    .description(
      'Find the governance decisions that govern a set of paths, in precedence order, and write a reproducible retrieval log. Deterministic, no AI.',
    )
    .option('--for <paths...>', 'code paths to find governing decisions for')
    .option('--coverage', 'report the proportion of active decisions carrying an executable check')
    .option('--log <path>', 'where to write the retrieval log (relative to cwd)', '.spectastic/adr-retrieval.json')
    .option('--json', 'print the retrieval log as JSON to stdout instead of a human summary')
    .action(async (opts: ForOptions & { coverage?: boolean }) => {
      if (opts.coverage) {
        await runCoverage();
        return;
      }
      await runFor(opts);
    });
}
