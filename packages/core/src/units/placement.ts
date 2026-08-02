/**
 * The placement verdict (spec 082-placement-verdict).
 *
 * Given a requirement and the units that might own it, produce a ranked case a
 * human can check — never a decision. P-14 records that this judgment resists
 * mechanisation, so an engine that decided would be overclaiming; one that
 * argues, with its evidence visible, is worth having.
 *
 * Pure: no filesystem, no clock, no network. Evidence arrives already gathered
 * (the adapter's job), which keeps the rules that decide a verdict testable
 * with plain objects.
 */

import {
  type ConfidenceThresholds,
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  type PlacementWeights,
  weightOf,
} from './placement-weights.js';

/**
 * The four classes (FR-002). Consumers bind to these names, so the set is
 * expensive to change and was fixed deliberately rather than left open.
 */
export type EvidenceClass = 'structural' | 'declared' | 'domain' | 'prior-art';

/** One reason a candidate might be right. Always attributable — no source, no evidence. */
export interface Evidence {
  cls: EvidenceClass;
  /** Where this came from: a coordinate, a config path, a spec id. */
  source: string;
  /** 0..1, scaled by the class weight. A boolean signal uses 1. */
  strength: number;
}

/** A unit that might own the work, with everything gathered for it. */
export interface Candidate {
  unit: string;
  evidence: Evidence[];
}

export type Confidence = 'high' | 'medium' | 'low';

/** How a verdict was produced — see D-001. Recorded so a reader can tell whether it re-runs. */
export type VerdictMode = 'deterministic' | 'refined';

export interface RankedCandidate {
  unit: string;
  score: number;
  evidence: Evidence[];
  /** Classes present, for a reader scanning why this ranked where it did. */
  classes: EvidenceClass[];
}

/**
 * The three terminal outcomes (FR-005/FR-006). Every form carries reasons: the
 * two refusals are as fully-formed as the placement, never an error path.
 */
export type Verdict =
  | {
      kind: 'placement';
      mode: VerdictMode;
      confidence: Confidence;
      hedged: boolean;
      ranked: RankedCandidate[];
      conflicts: string[];
    }
  | { kind: 'propose-new-unit'; mode: VerdictMode; reasons: string[] }
  | { kind: 'no-confident-owner'; mode: VerdictMode; reasons: string[]; ranked: RankedCandidate[] };

export interface RankOptions {
  weights?: PlacementWeights;
  thresholds?: ConfidenceThresholds;
  mode?: VerdictMode;
}

function scoreOf(candidate: Candidate, weights: PlacementWeights): number {
  let total = 0;
  for (const e of candidate.evidence) {
    const strength = Number.isFinite(e.strength) ? Math.max(0, Math.min(1, e.strength)) : 0;
    total += weightOf(weights, e.cls) * strength;
  }
  return total;
}

function classesOf(candidate: Candidate): EvidenceClass[] {
  return [...new Set(candidate.evidence.map((e) => e.cls))].sort();
}

/**
 * Where structural and domain evidence point at different candidates (FR-008).
 *
 * Surfaced rather than resolved: the conflict is the most informative thing in
 * the output, and a reader told the two signals disagree is better served than
 * one handed a winner.
 */
function findConflicts(ranked: RankedCandidate[]): string[] {
  const topBy = (cls: EvidenceClass): RankedCandidate | undefined =>
    ranked.filter((c) => c.classes.includes(cls)).sort((a, b) => b.score - a.score || a.unit.localeCompare(b.unit))[0];

  const structural = topBy('structural');
  const domain = topBy('domain');
  if (structural === undefined || domain === undefined) return [];
  if (structural.unit === domain.unit) return [];
  return [`structural evidence favours ${structural.unit}; domain resemblance favours ${domain.unit}`];
}

/**
 * Rank candidates and return a verdict.
 *
 * Deterministic by construction: ties break on the unit coordinate, so the
 * result never depends on input order (NFR-003).
 */
export function rankPlacement(candidates: readonly Candidate[], options: RankOptions = {}): Verdict {
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
  const mode: VerdictMode = options.mode ?? 'deterministic';

  const ranked: RankedCandidate[] = candidates
    .map((c) => ({ unit: c.unit, score: scoreOf(c, weights), evidence: c.evidence, classes: classesOf(c) }))
    .sort((a, b) => b.score - a.score || a.unit.localeCompare(b.unit));

  if (ranked.length === 0) {
    return {
      kind: 'propose-new-unit',
      mode,
      reasons: ['No existing unit was a candidate, so nothing here can own this work.'],
    };
  }

  const top = ranked[0];
  if (top === undefined || top.score < thresholds.medium) {
    return {
      kind: 'no-confident-owner',
      mode,
      // Never the least-bad candidate: forced choice over a ranked list always
      // returns something, and what it returns is the unit whose vocabulary the
      // requirement borrowed (FR-005).
      reasons: ['No candidate accumulated enough evidence to place this work.'],
      ranked,
    };
  }

  // Domain evidence alone must never reach the unhedged band (FR-009): that is
  // precisely the configuration that produces the producer/consumer failure.
  const domainOnly = top.classes.length === 1 && top.classes[0] === 'domain';
  const tiedAtTop = ranked.length > 1 && ranked[1]?.score === top.score;

  let confidence: Confidence = top.score >= thresholds.high ? 'high' : 'medium';
  if (domainOnly) confidence = 'low';

  const hedged = confidence === 'low' || tiedAtTop;

  return { kind: 'placement', mode, confidence, hedged, ranked, conflicts: findConflicts(ranked) };
}
