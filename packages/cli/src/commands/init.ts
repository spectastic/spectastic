import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Command } from 'commander';
import { resolveBundle } from './init/bundle.js';
import { buildPlan, findConflicts } from './init/plan.js';
import {
  NonTTYConflictError,
  UserCancelError,
  confirmTools,
  resolveConflicts,
  selectProfile,
} from './init/prompt.js';
import { currentCliEntry } from './init/hook.js';
import { printSummary } from './init/summary.js';
import { ToolsError, runTools } from './init/tools.js';
import { executeWrites } from './init/write.js';
import {
  UnknownProfileError,
  loadProfiles,
  profileNames,
  resolveProfile,
  type Profile,
} from './init/profiles.js';
import {
  combinedPrinciples,
  composeArtifacts,
  spliceUpgrade,
} from './init/compose.js';
import { readMarker, writeMarker } from './init/marker.js';
import { detectTooling } from '@spectastic/core/enforce/detect';
import { applyGitignore } from '@spectastic/core/gitignore/apply';
import { BASE_ENTRIES } from '@spectastic/core/gitignore/entries';
import type { FileWriteDecision } from './init/types.js';

interface InitOptions {
  force?: boolean;
  with?: string[];
  tools?: boolean;
  hooksOnly?: boolean;
  commandsOnly?: boolean;
  uninstall?: boolean;
  profile?: string;
  replaceTools?: boolean;
  gitignore?: boolean;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Today's date as { iso: "YYYY-MM-DD", display: "DD Mon YYYY" }. */
function today(): { iso: string; display: string } {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { iso, display: `${String(day).padStart(2, '0')} ${MONTHS[m]} ${y}` };
}

/** Collect repeatable `--with <verb>` values into an array. */
function collectVerb(value: string, previous: string[]): string[] {
  return previous.concat(value);
}

/**
 * Run the `init --tools` guarantee-layer install/uninstall (spec 031). Any of
 * --tools / --hooks-only / --commands-only / --uninstall routes here instead of
 * the project bootstrap. --tools means both halves; the -only flags narrow it;
 * --uninstall reverses whichever halves are selected (both by default).
 */
async function runToolsMode(options: InitOptions): Promise<void> {
  const narrowed = options.hooksOnly === true || options.commandsOnly === true;
  const hooks = options.hooksOnly === true || (!narrowed);
  const commands = options.commandsOnly === true || (!narrowed);
  try {
    const summary = await runTools({
      cwd: process.cwd(),
      hooks,
      commands,
      uninstall: options.uninstall === true,
      force: options.force ?? false,
      cliEntry: currentCliEntry(),
    });
    for (const d of summary.decisions) process.stdout.write(`✓ ${d.detail}\n`);
    for (const n of summary.notes) process.stdout.write(`⚠ ${n}\n`);
    process.exit(0);
  } catch (err) {
    if (err instanceof ToolsError) {
      process.stderr.write(`${err.message}\n`);
      process.exit(2);
    }
    throw err;
  }
}

/**
 * Register the `init` subcommand. Bootstraps a spectastic project in
 * the current working directory by writing the canonical 17-file
 * lifecycle structure (8 slash commands + 2 assets + 7 templates).
 *
 * Per FR-001..FR-009 of specs/003-init-node-port/spec.html.
 * Conflict UX delegates to `resolveConflicts` (prompt.ts); --force
 * + non-TTY refusal land via FR-004 + FR-005.
 */
export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Bootstrap a spectastic project in the current directory.')
    .option('-f, --force', 'overwrite existing files without prompting')
    .option(
      '--with <verb>',
      'also install an extended (opt-in) verb, e.g. --with explain (repeatable)',
      collectVerb,
      [],
    )
    .option('--tools', 'install the guarantee layer: a pre-commit validate gate + drift-proof command adapters')
    .option('--hooks-only', 'with --tools/--uninstall: only the pre-commit gate half')
    .option('--commands-only', 'with --tools/--uninstall: only the command-adapter half')
    .option('--uninstall', 'remove what init --tools installed (reversible)')
    .option('--profile <name>', 'seed principles + AGENTS.md from a profile: lean | standard | verified | enterprise')
    .option('--replace-tools', 'with --profile: ignore existing toolchain when tailoring the AGENTS.md enforcement floor')
    .option('--no-gitignore', 'skip writing the base .gitignore block')
    .action(async (options: InitOptions) => {
      if (options.tools || options.hooksOnly || options.commandsOnly || options.uninstall) {
        await runToolsMode(options);
        return;
      }

      const cwd = process.cwd();
      const inventory = resolveBundle();
      const plan = buildPlan({
        inventory,
        cwd,
        withVerbs: options.with ?? [],
      });

      // Spec 041 — resolve a profile and append its composed artifacts to the
      // plan (independent of --tools; FR-008). Exits 2 on an unknown name.
      let resolvedProfile: Profile | null = null;
      try {
        resolvedProfile = await appendProfile(plan, inventory.root, cwd, options);
      } catch (err) {
        if (err instanceof UnknownProfileError) {
          process.stderr.write(`${err.message}\n`);
          process.exit(2);
        }
        throw err;
      }

      const conflicts = findConflicts(plan);

      try {
        await resolveConflicts(conflicts, { force: options.force ?? false });
      } catch (err) {
        if (err instanceof NonTTYConflictError) {
          process.stderr.write(`${err.message}\n`);
          process.exit(2);
        }
        if (err instanceof UserCancelError) {
          process.stderr.write(`${err.message}\n`);
          process.exit(2);
        }
        throw err;
      }

      const summary = await executeWrites(plan);
      printSummary(summary);
      if (resolvedProfile) {
        await writeMarker(cwd, resolvedProfile.name);
        process.stdout.write(`✓ profile: ${resolvedProfile.name}\n`);
      }
      // Spec 043: write the base .gitignore block (spectastic ephemera). Stack
      // entries come later via `spectastic gitignore --stack` at plan time.
      // --no-gitignore (commander sets options.gitignore=false) opts out.
      if (options.gitignore !== false) {
        const wrote = await applyGitignore(cwd, BASE_ENTRIES);
        if (wrote) process.stdout.write('✓ wrote .gitignore (spectastic ephemera)\n');
      }
      // Spec 031 T-001: make the guarantee layer discoverable. Interactive init
      // offers to install it (auto-commits + the pre-commit gate); non-interactive
      // init prints a tip so a CI/scripted user learns it exists.
      await offerTools(cwd, options.force ?? false);
      process.exit(0);
    });
}

/**
 * Surface the 031 guarantee layer at init time (spec 031 T-001). In a TTY,
 * prompt to install it now and run it on opt-in; otherwise (or on decline),
 * print a one-line tip so `--tools` is never silently undiscovered.
 */
async function offerTools(cwd: string, force: boolean): Promise<void> {
  const tip = 'tip: `spectastic init --tools` installs the guarantee layer (pre-commit gate + auto-commit) — off by default.';
  if (!process.stdout.isTTY) {
    process.stdout.write(`  ${tip}\n`);
    return;
  }
  if (!(await confirmTools())) {
    process.stdout.write(`  ${tip}\n`);
    return;
  }
  try {
    const toolsSummary = await runTools({
      cwd,
      hooks: true,
      commands: true,
      uninstall: false,
      force,
      cliEntry: currentCliEntry(),
    });
    for (const d of toolsSummary.decisions) process.stdout.write(`✓ ${d.detail}\n`);
    for (const n of toolsSummary.notes) process.stdout.write(`⚠ ${n}\n`);
  } catch (err) {
    if (err instanceof ToolsError) {
      process.stderr.write(`${err.message}\n`);
      return;
    }
    throw err;
  }
}

/**
 * Spec 041: resolve the profile (explicit flag → interactive select in a TTY →
 * none), compose its three artifacts, and append them to the plan. On a re-run
 * that changes profile, splice the new principles into an existing
 * principles.html additively (FR-007) so the user's edits survive.
 *
 * Returns the resolved profile (for the success marker), or null when no
 * profile applies (no flag + non-TTY, or the user skipped the prompt).
 * Throws UnknownProfileError for an unrecognised `--profile` name.
 */
async function appendProfile(
  plan: FileWriteDecision[],
  bundleRoot: string,
  cwd: string,
  options: InitOptions,
): Promise<Profile | null> {
  const manifest = loadProfiles(bundleRoot);

  let name: string | null;
  if (typeof options.profile === 'string') {
    name = options.profile;
  } else if (process.stdout.isTTY) {
    name = await selectProfile(profileNames(manifest));
  } else {
    // FR-005: no flag + non-TTY → no profile applied; preserve today's behaviour.
    name = null;
  }
  if (name === null) {
    if (options.profile === undefined && !process.stdout.isTTY) {
      process.stdout.write('init: no --profile given (non-interactive); skipping profile scaffolding.\n');
    }
    return null;
  }

  const profile = resolveProfile(manifest, name); // throws UnknownProfileError
  const { iso, display } = today();
  // FR-006: detect the existing toolchain so the AGENTS.md enforcement floor
  // acknowledges what's already covered (brownfield respect). --replace-tools
  // ignores it and treats everything as a gap.
  const covered = options.replaceTools ? new Set<never>() : detectTooling(cwd);
  const composed = composeArtifacts({
    bundleRoot,
    manifest,
    profile,
    cwd,
    projectName: basename(cwd),
    date: iso,
    displayDate: display,
    covered,
  });

  // FR-007: additive upgrade. If the marker records a different prior profile
  // and an existing principles.html carries the sentinel, splice the new
  // principles in and pre-resolve that decision to a safe overwrite (findConflicts
  // skips pre-resolved decisions, so it bypasses the y/N/skip prompt).
  const prior = readMarker(cwd);
  if (prior && prior.profile !== profile.name) {
    const principlesDecision = composed.find((d) => d.destination === join(cwd, 'principles.html'));
    if (principlesDecision?.preExisting) {
      const existing = readFileSync(principlesDecision.destination, 'utf8');
      const merged = spliceUpgrade(existing, combinedPrinciples(manifest, profile));
      if (merged !== null) {
        principlesDecision.content = merged;
        principlesDecision.action = 'overwrite';
      }
    }
  }

  plan.push(...composed);
  return profile;
}
