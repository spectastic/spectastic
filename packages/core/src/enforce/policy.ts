import { daysBetween, isBoilerplateReason, MAX_WAIVER_DAYS, parseIsoDate } from './config.js';
import type { EnforceGate, EnforcementCategory, EnforceWaiver, RelaxedCategory } from './types.js';

/**
 * The pure enforcement policy diff (spec 042, D-003) — moved to core from the
 * CLI so the deterministic guarantee lives in the kernel (triage 042/T-001).
 * No I/O; unit-testable. Determinism is scoped to the filesystem *and* an
 * injected clock (NFR-001, as amended for waiver expiry): a result that depends
 * on the current date takes `now` as a parameter so a fixture pins it.
 */

export interface EnforceEvaluation {
  /** Required, uncovered, and NOT structurally undetectable — these gate. */
  missing: EnforcementCategory[];
  /** Required, uncovered, but structurally undetectable in every detected
   *  ecosystem — demoted from a hard failure to a warning (FR-010). */
  warned: EnforcementCategory[];
  /** Required, uncovered, but an active well-formed waivable waiver demotes it
   *  to an advisory warning (FR-004 / FR-011) — surfaced as its own tally. */
  relaxed: RelaxedCategory[];
  /** Waivers whose `until` has passed — the category resumes blocking (auto-expiry)
   *  and the stale decision is surfaced loudly so it is renewed or removed. */
  expired: EnforceWaiver[];
  covered: EnforcementCategory[];
  exitCode: 0 | 1;
}

/**
 * Categories that have no config-file surface in certain ecosystems — the
 * category is real but statically undetectable there (spec 042, FR-010).
 * Coverage in Go is the founding case: `go test -cover` is a flag, not a
 * config file, so presence-detection can never see it. Extensible as new
 * category/ecosystem gaps surface; never used to suppress a category that
 * genuinely has a detectable signal in the project's stack.
 */
export const STRUCTURALLY_UNDETECTABLE: Readonly<Partial<Record<EnforcementCategory, readonly string[]>>> = {
  coverage: ['go'],
  // Swift and C++ have no standard metrics-exporter-in-manifest convention the
  // way Java/Go/JS/Python/Rust do, so an observability exporter can't be
  // presence-detected there — warn rather than false-fail a hard gate.
  observability: ['swift', 'cpp'],
};

/**
 * The profile tiers at which the contract-checked rung applies (spec
 * 074-contract-checked-tier, FR-001 / NFR-002). The `contracts` profile axis
 * already ladders posture by rigor — standard says `contract-first`, verified
 * says `contract-checked` — so the floor follows a distinction the profiles
 * draw rather than inventing one.
 *
 * This is the FIRST thing the rung consults, so a below-verified project
 * short-circuits before any signal is read: NFR-002's "at most 0 lean- or
 * standard-profile projects may gain a gap" then holds structurally, not by
 * a test that has to remember to check.
 */
const CONTRACT_CHECKED_TIERS: ReadonlySet<string> = new Set(['verified', 'enterprise']);

/** True when the project's profile tier evaluates the contract-checked rung (074, FR-001). */
export function contractCheckedApplies(tier: string | undefined): boolean {
  return tier !== undefined && CONTRACT_CHECKED_TIERS.has(tier);
}

/**
 * Contract formats whose ecosystem lacks a mainstream tool for one half of the
 * check (spec 074, FR-003 / D-003). Clones STRUCTURALLY_UNDETECTABLE's shape
 * but is keyed by contract FORMAT rather than ecosystem, and is named
 * distinctly so the two are never conflated: that map says the stack cannot
 * express a category at all; this one says a specific check has no tool to
 * configure.
 *
 * The affected half reports advisory WITH the limitation stated (FR-003) —
 * never a hard fail (failing a project for tooling that does not exist is the
 * warn-washing the enforcement design avoids) and never a silent pass (which
 * would overstate what the rung means).
 *
 * Deliberately data, not control flow: this is a claim about the world that
 * will age as tooling matures, and the project should be able to read and
 * revise it (the spec's own §4 note).
 */
export const CONTRACT_CHECK_CAPABILITY_LIMITS: Readonly<Record<string, readonly ('linter' | 'differ')[]>> = {
  // Spectral's AsyncAPI ruleset covers 2.x while the request/reply story is
  // 3.0, and event-diff tooling is materially thinner than OpenAPI's — so the
  // rung does not promise parity for the differ half.
  asyncapi: ['differ'],
  // GraphQL has mature linters (graphql-eslint) and inspector-style diffing is
  // available but far less commonly wired than OpenAPI's; the differ half is
  // treated as capability-limited rather than assumed.
  graphql: ['differ'],
};

/** One contract's shortfall on one half of the check (074, FR-004). */
export interface ContractCheckShortfall {
  /** Project-relative path of the contract, so the report names the file. */
  path: string;
  format: string;
  half: 'linter' | 'differ';
  /** Why this half cannot block, when it is capability-limited (FR-003). */
  limitation?: string;
}

export interface ContractCheckVerdict {
  /** Shortfalls that gate — a real gap with mainstream tooling available. */
  blocking: ContractCheckShortfall[];
  /** Shortfalls demoted because the format's tooling lacks that half (FR-003). */
  advisory: ContractCheckShortfall[];
}

/** The state of one contract's two checks, as produced by `detectContractChecks`. */
interface ContractCheckInput {
  path: string;
  format: string;
  linted: boolean;
  diffed: boolean;
}

/**
 * Split each contract's missing halves into blocking and advisory (074,
 * FR-003 / FR-004). A half missing where the format HAS mainstream tooling is
 * a real gap; a half missing where it does not is advisory with the limitation
 * stated — never a silent pass, so the rung neither overclaims nor quietly
 * exempts.
 *
 * Pure: takes already-detected state, touches no filesystem. The tier gate
 * (`contractCheckedApplies`) is the caller's to apply first — below verified
 * this is never reached at all.
 */
export function evaluateContractChecks(contracts: readonly ContractCheckInput[]): ContractCheckVerdict {
  const blocking: ContractCheckShortfall[] = [];
  const advisory: ContractCheckShortfall[] = [];

  for (const contract of contracts) {
    const limited = CONTRACT_CHECK_CAPABILITY_LIMITS[contract.format] ?? [];
    const halves: ReadonlyArray<{ half: 'linter' | 'differ'; configured: boolean }> = [
      { half: 'linter', configured: contract.linted },
      { half: 'differ', configured: contract.diffed },
    ];

    for (const { half, configured } of halves) {
      if (configured) continue;
      const shortfall: ContractCheckShortfall = { path: contract.path, format: contract.format, half };
      if (limited.includes(half)) {
        advisory.push({
          ...shortfall,
          limitation: `no mainstream ${half === 'differ' ? 'breaking-change differ' : 'linter'} tooling exists for ${contract.format} — reported, not gated`,
        });
      } else {
        blocking.push(shortfall);
      }
    }
  }

  return { blocking, advisory };
}

/** Which bucket a required-but-uncovered category resolves into. */
type GapResolution =
  | { bucket: 'warned' }
  | { bucket: 'relaxed'; waiver: EnforceWaiver }
  | { bucket: 'expired'; waiver: EnforceWaiver }
  | { bucket: 'missing' };

/**
 * Classify a waiver against the policy at a given instant. Fail-closed: anything
 * un-relaxable, malformed, boilerplate, or out-of-range is `invalid` (never
 * relaxes); a past `until` is `expired` (blocks, but surfaced loudly); only a
 * complete, in-range, waivable, current waiver is `active`. The date checks take
 * `now` so the decision is reproducible for a fixture (NFR-001).
 */
function classifyWaiver(
  waiver: EnforceWaiver,
  unwaivable: ReadonlySet<EnforcementCategory>,
  now: Date,
): 'active' | 'expired' | 'invalid' {
  if (unwaivable.has(waiver.category)) return 'invalid';
  if (isBoilerplateReason(waiver.reason)) return 'invalid';
  if (waiver.owner.trim().length === 0) return 'invalid';
  const until = parseIsoDate(waiver.until);
  if (until === null) return 'invalid';
  const days = daysBetween(now, until);
  if (days < 0) return 'expired';
  if (days > MAX_WAIVER_DAYS) return 'invalid';
  return 'active';
}

/** Resolve one required-but-uncovered category to its bucket (advisory → FR-010 → waiver → missing). */
function resolveGap(
  category: EnforcementCategory,
  ctx: {
    ecosystems: ReadonlySet<string>;
    undetectable: Readonly<Partial<Record<EnforcementCategory, readonly string[]>>>;
    advisory: ReadonlySet<EnforcementCategory>;
    waiverByCategory: ReadonlyMap<EnforcementCategory, EnforceWaiver>;
    unwaivable: ReadonlySet<EnforcementCategory>;
    now: Date;
  },
): GapResolution {
  // Caller-declared advisory (spec 073, FR-004 / D-003): the category plainly
  // APPLIES — an interface was detected — but only through a signal too weak to
  // hard-gate on (today: an event-driven-only recognition, which cannot tell a
  // publisher from a consumer). Distinct from the FR-010 demotion below, which
  // fires when the stack cannot express the category at all. Resolved first so
  // a project never has to author a waiver for a gap the policy itself has
  // already decided is advisory.
  if (ctx.advisory.has(category)) return { bucket: 'warned' };

  const undetectableIn = ctx.undetectable[category];
  const isStructurallyUndetectable =
    undetectableIn !== undefined &&
    ctx.ecosystems.size > 0 &&
    [...ctx.ecosystems].every((eco) => undetectableIn.includes(eco));
  if (isStructurallyUndetectable) return { bucket: 'warned' };

  const waiver = ctx.waiverByCategory.get(category);
  if (waiver === undefined) return { bucket: 'missing' };
  const verdict = classifyWaiver(waiver, ctx.unwaivable, ctx.now);
  if (verdict === 'active') return { bucket: 'relaxed', waiver };
  if (verdict === 'expired') return { bucket: 'expired', waiver };
  return { bucket: 'missing' };
}

/**
 * Diff required vs covered categories, gated by severity.
 *
 * Resolution order per required-but-uncovered category:
 *   1. caller-declared advisory → `warned` (spec 073 FR-004: the category applies,
 *      but the signal that detected it is too weak to hard-gate on);
 *   2. structurally undetectable in every detected ecosystem → `warned` (FR-010);
 *   3. else an active, well-formed, waivable waiver → `relaxed` (FR-004 / FR-011);
 *   4. else a waiver exists but is expired → recorded in `expired`, still blocks;
 *   5. else → `missing`.
 * `relaxed` never counts toward `missing`, so it never blocks but always warns;
 * `expired`/malformed/un-relaxable never relax (fail-closed). Callers that pass
 * no `ecosystems`/`waivers` get the pre-waiver behavior: every gap is `missing`.
 */
export function evaluateEnforcement(
  required: readonly EnforcementCategory[],
  covered: ReadonlySet<EnforcementCategory>,
  gate: EnforceGate,
  ecosystems: ReadonlySet<string> = new Set(),
  options: {
    undetectable?: Readonly<Partial<Record<EnforcementCategory, readonly string[]>>>;
    /** Categories whose gap is advisory for THIS project — detected, but by a
     *  signal too weak to hard-gate on (spec 073 FR-004). Absent/empty → the
     *  pre-073 behaviour exactly. */
    advisory?: readonly EnforcementCategory[];
    waivers?: readonly EnforceWaiver[];
    unwaivable?: readonly EnforcementCategory[];
    now?: Date;
  } = {},
): EnforceEvaluation {
  const {
    undetectable = STRUCTURALLY_UNDETECTABLE,
    advisory = [],
    waivers = [],
    unwaivable = [],
    now = new Date(),
  } = options;
  const unwaivableSet = new Set(unwaivable);
  // Index the first waiver per category (a project declares at most one per category).
  const waiverByCategory = new Map<EnforcementCategory, EnforceWaiver>();
  for (const w of waivers) {
    if (!waiverByCategory.has(w.category)) waiverByCategory.set(w.category, w);
  }

  const missing: EnforcementCategory[] = [];
  const warned: EnforcementCategory[] = [];
  const relaxed: RelaxedCategory[] = [];
  const expired: EnforceWaiver[] = [];
  const ctx = {
    ecosystems,
    undetectable,
    advisory: new Set(advisory),
    waiverByCategory,
    unwaivable: unwaivableSet,
    now,
  };

  for (const category of required) {
    if (covered.has(category)) continue;
    const resolution = resolveGap(category, ctx);
    switch (resolution.bucket) {
      case 'warned':
        warned.push(category);
        break;
      case 'relaxed':
        relaxed.push({
          category,
          reason: resolution.waiver.reason,
          until: resolution.waiver.until,
          owner: resolution.waiver.owner,
        });
        break;
      case 'expired':
        expired.push(resolution.waiver);
        missing.push(category); // an expired waiver auto-blocks
        break;
      case 'missing':
        missing.push(category);
        break;
    }
  }

  const exitCode: 0 | 1 = gate === 'hard' && missing.length > 0 ? 1 : 0;
  return { missing, warned, relaxed, expired, covered: [...covered], exitCode };
}
