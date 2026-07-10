import type { Command } from 'commander';
import { resolveBundle } from './init/bundle.js';
import { detectTooling } from './init/detect.js';
import { readMarker } from './init/marker.js';
import { loadProfiles } from './init/profiles.js';
import type { EnforceGate, EnforcementCategory } from './init/profiles.js';

/**
 * `spectastic enforce [path]` — the profile enforcement floor as a gate
 * (spec 042, FR-001 / FR-004).
 *
 * Reads the project's `.spectastic/profile.json` marker (041), detects which
 * enforcement categories the toolchain covers, and diffs against the profile's
 * required categories. Exit code follows the profile's gate severity:
 *   none (Lean / no marker) → 0 always
 *   soft (Standard)         → 0, but warn on a gap
 *   hard (Verified/Ent.)    → 1 on any gap
 * So a pre-commit / CI gate can block precisely where it should. Deterministic,
 * filesystem-only — no network, no model (NFR-001).
 */

export interface EnforceEvaluation {
  missing: EnforcementCategory[];
  covered: EnforcementCategory[];
  exitCode: 0 | 1;
}

/** Pure policy diff (spec 042, D-003) — unit-testable, no I/O. */
export function evaluateEnforcement(
  required: readonly EnforcementCategory[],
  covered: ReadonlySet<EnforcementCategory>,
  gate: EnforceGate,
): EnforceEvaluation {
  const missing = required.filter((c) => !covered.has(c));
  const exitCode: 0 | 1 = gate === 'hard' && missing.length > 0 ? 1 : 0;
  return { missing, covered: [...covered], exitCode };
}

export function registerEnforce(program: Command): void {
  program
    .command('enforce')
    .description(
      "Check that the project's toolchain covers its profile's required enforcement categories (spec 042). Exits 1 when a hard-gate profile has a gap.",
    )
    .argument('[path]', 'project root to inspect', '.')
    .action((path: string) => {
      const cwd = path;
      const marker = readMarker(cwd);
      if (marker === null) {
        process.stdout.write('enforce: no profile marker (.spectastic/profile.json); nothing to enforce.\n');
        process.exit(0);
      }

      const manifest = loadProfiles(resolveBundle().root);
      const profile = manifest.profiles[marker.profile];
      if (!profile) {
        process.stdout.write(`enforce: unknown profile "${marker.profile}" in marker; nothing to enforce.\n`);
        process.exit(0);
      }

      const covered = detectTooling(cwd);
      const { missing, exitCode } = evaluateEnforcement(
        profile.enforce.required,
        covered,
        profile.enforce.gate,
      );

      process.stdout.write(`enforce: profile ${profile.name} (${profile.enforce.gate} gate)\n`);
      process.stdout.write(`  covered: ${[...covered].sort().join(', ') || '(none)'}\n`);
      if (missing.length === 0) {
        process.stdout.write('  ✓ all required enforcement categories are covered.\n');
        process.exit(0);
      }

      const marker2 = exitCode === 1 ? '✗' : '⚠';
      process.stdout.write(`  ${marker2} missing: ${missing.join(', ')}\n`);
      if (exitCode === 1) {
        process.stderr.write(
          `enforce: ${profile.name} requires these enforcement categories — wire a tool for each (or lower the profile).\n`,
        );
      } else {
        process.stdout.write('  (soft gate — not blocking, but recommended.)\n');
      }
      process.exit(exitCode);
    });
}
