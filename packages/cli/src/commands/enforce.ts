import { loadWaivers } from '@spectastic/core/enforce/config';
import { detectEcosystems, detectTooling } from '@spectastic/core/enforce/detect';
import { evaluateEnforcement } from '@spectastic/core/enforce/policy';
import type { Command } from 'commander';
import { resolveBundle } from './init/bundle.js';
import { readMarker } from './init/marker.js';
import { loadProfiles } from './init/profiles.js';

/**
 * `spectastic enforce [path]` — the profile enforcement floor as a gate
 * (spec 042, FR-001 / FR-004). Thin CLI over the core detection + policy diff
 * (`@spectastic/core/enforce/*`, moved there in triage 042/T-001).
 *
 * Reads the project's `.spectastic/profile.json` marker (041), detects which
 * enforcement categories the toolchain covers, and diffs against the profile's
 * required categories. Exit code follows the profile's gate severity:
 *   none (Lean / no marker) → 0 always
 *   soft (Standard)         → 0, but warn on a gap
 *   hard (Verified/Ent.)    → 1 on any gap
 * Deterministic, filesystem-only — no network, no model (NFR-001).
 */

export function registerEnforce(program: Command): void {
  program
    .command('enforce')
    .description(
      "Check that the project's toolchain covers its profile's required enforcement categories. Exits 1 when a hard-gate profile has a gap.",
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
      const ecosystems = detectEcosystems(cwd);
      const waivers = loadWaivers(cwd);
      const { missing, warned, relaxed, expired, exitCode } = evaluateEnforcement(
        profile.enforce.required,
        covered,
        profile.enforce.gate,
        ecosystems,
        { waivers, unwaivable: profile.enforce.unwaivable },
      );

      process.stdout.write(`enforce: profile ${profile.name} (${profile.enforce.gate} gate)\n`);
      process.stdout.write(`  covered: ${[...covered].sort().join(', ') || '(none)'}\n`);
      if (warned.length > 0) {
        // FR-010: required but structurally undetectable in this project's
        // ecosystem(s) — never a blocking gap, regardless of gate severity.
        process.stdout.write(`  ⚠ undetectable in this ecosystem (not blocking): ${warned.join(', ')}\n`);
      }
      for (const r of relaxed) {
        // FR-004 / FR-011: a deliberately-waived category — advisory, never silent,
        // reported as its own tally so a relaxed floor stays visible.
        process.stdout.write(
          `  ⚠ relaxed (waived · advisory): ${r.category} — "${r.reason}" (owner ${r.owner}, expires ${r.until})\n`,
        );
      }
      for (const w of expired) {
        // An expired waiver auto-blocks (FR-011): surfaced loudly so it is renewed or removed.
        process.stdout.write(`  ✗ waiver for ${w.category} expired ${w.until} — now blocking; renew or cover.\n`);
      }
      // The distinct tally (never fold relaxed into covered): N covered · M relaxed · K missing.
      process.stdout.write(`  → ${covered.size} covered · ${relaxed.length} relaxed · ${missing.length} missing\n`);
      if (missing.length === 0) {
        process.stdout.write('  ✓ no blocking gaps.\n');
        process.exit(0);
      }

      const marker2 = exitCode === 1 ? '✗' : '⚠';
      process.stdout.write(`  ${marker2} missing: ${missing.join(', ')}\n`);
      if (exitCode === 1) {
        process.stderr.write(
          `enforce: ${profile.name} requires these enforcement categories — wire a tool for each, waive it (spectastic.json enforce.waivers), or lower the profile.\n`,
        );
      } else {
        process.stdout.write('  (soft gate — not blocking, but recommended.)\n');
      }
      process.exit(exitCode);
    });
}
