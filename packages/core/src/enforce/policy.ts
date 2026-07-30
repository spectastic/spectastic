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

/** Resolve one required-but-uncovered category to its bucket (FR-010 → waiver → missing). */
function resolveGap(
  category: EnforcementCategory,
  ctx: {
    ecosystems: ReadonlySet<string>;
    undetectable: Readonly<Partial<Record<EnforcementCategory, readonly string[]>>>;
    waiverByCategory: ReadonlyMap<EnforcementCategory, EnforceWaiver>;
    unwaivable: ReadonlySet<EnforcementCategory>;
    now: Date;
  },
): GapResolution {
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
 *   1. structurally undetectable in every detected ecosystem → `warned` (FR-010);
 *   2. else an active, well-formed, waivable waiver → `relaxed` (FR-004 / FR-011);
 *   3. else a waiver exists but is expired → recorded in `expired`, still blocks;
 *   4. else → `missing`.
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
    waivers?: readonly EnforceWaiver[];
    unwaivable?: readonly EnforcementCategory[];
    now?: Date;
  } = {},
): EnforceEvaluation {
  const { undetectable = STRUCTURALLY_UNDETECTABLE, waivers = [], unwaivable = [], now = new Date() } = options;
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
