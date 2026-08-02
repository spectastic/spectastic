import { loadWaivers } from '@spectastic/core/enforce/config';
import type { DeclaredContractPath } from '@spectastic/core/enforce/detect';
import {
  contractFirstIsAdvisory,
  detectContractChecks,
  detectEcosystems,
  detectTooling,
  unresolvedDeclaredContracts,
} from '@spectastic/core/enforce/detect';
import { contractCheckedApplies, evaluateContractChecks, evaluateEnforcement } from '@spectastic/core/enforce/policy';
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

/**
 * One line per declared-but-absent contract, naming the design that declared it
 * (spec 073 FR-008). A ratified design's declaration binds; an unratified one is
 * intent, and declaring intent must never be the thing that breaks the build —
 * so the two read differently and only the first is a failure mark.
 */
function formatUnresolvedContracts(unresolved: readonly DeclaredContractPath[]): string {
  return unresolved
    .map((u) =>
      u.ratified
        ? `  ✗ contract ${u.path} is declared by ${u.specId} but not present.\n`
        : `  ⚠ contract ${u.path} is declared by ${u.specId} but not present — advisory while that spec is unratified.\n`,
    )
    .join('');
}

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
      // Spec 073 FR-004: a contract-first gap recognised ONLY through an
      // event-driven signal reports advisory, never a hard fail — the decision
      // itself is core's (contractFirstIsAdvisory), this is just the wiring.
      const advisory = contractFirstIsAdvisory(cwd) ? (['contract-first'] as const) : [];
      // Spec 074 FR-001: at verified and above, holding a contract also requires
      // a configured linter and breaking-change differ. Tier-gated FIRST, so a
      // lean/standard project short-circuits before any signal is read and its
      // verdict cannot change (NFR-002).
      const contractChecks = contractCheckedApplies(marker.profile)
        ? evaluateContractChecks(detectContractChecks(cwd))
        : { blocking: [], advisory: [] };
      const { missing, warned, relaxed, expired, exitCode } = evaluateEnforcement(
        profile.enforce.required,
        covered,
        profile.enforce.gate,
        ecosystems,
        { advisory, waivers, unwaivable: profile.enforce.unwaivable },
      );

      process.stdout.write(`enforce: profile ${profile.name} (${profile.enforce.gate} gate)\n`);
      process.stdout.write(`  covered: ${[...covered].sort().join(', ') || '(none)'}\n`);
      // Both reasons land in `warned`, but they mean different things to a
      // reader, so they are reported apart (spec 073 FR-004 vs. FR-010): one
      // says the stack cannot express the category at all, the other says the
      // category applies and only the signal that found it is weak.
      const advisorySet = new Set<string>(advisory);
      const undetectableWarned = warned.filter((c) => !advisorySet.has(c));
      const advisoryWarned = warned.filter((c) => advisorySet.has(c));
      if (undetectableWarned.length > 0) {
        // FR-010: required but structurally undetectable in this project's
        // ecosystem(s) — never a blocking gap, regardless of gate severity.
        process.stdout.write(`  ⚠ undetectable in this ecosystem (not blocking): ${undetectableWarned.join(', ')}\n`);
      }
      // Spec 073 FR-008: an unresolved declared contract path names the spec
      // whose design declared it. A reader told a path is missing cannot act
      // without knowing which design asked for it.
      const unresolved = unresolvedDeclaredContracts(cwd);
      if (advisoryWarned.length > 0 && unresolved.length === 0) {
        // Only the event-driven cause gets the event-driven explanation; when a
        // declared path is what made this advisory, the per-path lines below say
        // so instead, and this sentence would be actively misleading.
        process.stdout.write(
          `  ⚠ advisory (not blocking): ${advisoryWarned.join(', ')} — an event-driven interface is declared but no contract is checked in. Add a payload contract (e.g. an AsyncAPI document), or declare the interface shape in the design if this service publishes nothing.\n`,
        );
      }
      process.stdout.write(formatUnresolvedContracts(unresolved));
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
      // Spec 074 FR-004: the contract-checked rung names WHICH contract and
      // WHICH half is short, rather than a bare category verdict. Advisory
      // shortfalls state their limitation (FR-003) so a reader can tell
      // "no tooling exists" from "you didn't configure it".
      for (const a of contractChecks.advisory) {
        process.stdout.write(
          `  ⚠ contract check (advisory): ${a.path} has no ${a.half} configured — ${a.limitation}\n`,
        );
      }
      for (const b of contractChecks.blocking) {
        process.stdout.write(
          `  ✗ contract check: ${b.path} has no ${b.half} configured — ${profile.name} expects a checked contract, not merely a present one.\n`,
        );
      }
      // The distinct tally (never fold relaxed into covered): N covered · M relaxed · K missing.
      process.stdout.write(`  → ${covered.size} covered · ${relaxed.length} relaxed · ${missing.length} missing\n`);
      // A blocking contract-check shortfall gates on the same terms as a missing
      // category: only under a hard gate (074 FR-001 — the rung is tier-gated to
      // verified/enterprise, both of which are hard, but the gate severity is
      // still read rather than assumed).
      const checksGate = profile.enforce.gate === 'hard' && contractChecks.blocking.length > 0;
      const finalExitCode = checksGate ? 1 : exitCode;

      if (missing.length === 0 && !checksGate) {
        process.stdout.write('  ✓ no blocking gaps.\n');
        process.exit(0);
      }

      if (missing.length > 0) {
        const marker2 = exitCode === 1 ? '✗' : '⚠';
        process.stdout.write(`  ${marker2} missing: ${missing.join(', ')}\n`);
      }
      if (finalExitCode === 1) {
        if (missing.length > 0) {
          process.stderr.write(
            `enforce: ${profile.name} requires these enforcement categories — wire a tool for each, waive it (spectastic.json enforce.waivers), or lower the profile.\n`,
          );
        }
        if (checksGate) {
          process.stderr.write(
            `enforce: ${profile.name} expects every checked-in contract to have a configured linter and breaking-change differ. Configure the named check, or lower the profile.\n`,
          );
        }
      } else {
        process.stdout.write('  (soft gate — not blocking, but recommended.)\n');
      }
      process.exit(finalExitCode);
    });
}
