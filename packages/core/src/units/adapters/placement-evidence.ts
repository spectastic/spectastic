/**
 * Gathering placement evidence (spec 082, US3).
 *
 * Consumes what 079 and 081 already produce rather than re-deriving either, and
 * scores domain resemblance lexically — no index, no embeddings, per the
 * corpus's standing stance (D-002).
 *
 * Resemblance is deliberately weak. A sharper signal would make the opening
 * failure *more* confident, not less: a requirement genuinely does resemble the
 * unit whose vocabulary it borrowed, so the ranking must be able to outrank it
 * rather than measure it better.
 */

import type { Candidate, Evidence } from '../placement.js';
import type { BoundaryResult } from '../boundary.js';
import type { Edge } from '../types.js';

/**
 * Tokens too common to discriminate. Without this every candidate scores alike
 * and the ranking is noise rather than signal.
 */
const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'is',
  'are',
  'be',
  'it',
  'that',
  'this',
  'with',
  'as',
  'by',
  'at',
  'from',
  'we',
  'should',
  'must',
  'may',
  'when',
  'not',
]);

/** Lowercased word tokens, stopwords and very short fragments dropped. */
export function tokenise(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

/**
 * Normalised overlap in 0..1 — the share of the requirement's own vocabulary
 * the candidate's text covers.
 *
 * Normalised against the *requirement* rather than the union, so a candidate
 * with a great deal of text cannot score highly just by being large.
 */
export function lexicalOverlap(requirement: string, candidateText: string): number {
  const want = tokenise(requirement);
  if (want.size === 0) return 0;
  const have = tokenise(candidateText);
  let hits = 0;
  for (const token of want) if (have.has(token)) hits++;
  return hits / want.size;
}

export interface EvidenceInput {
  /** The requirement being placed, as prose. */
  requirement: string;
  /** Units that could own it. */
  units: readonly string[];
  /** Resolved edges from 079. */
  edges: readonly Edge[];
  /** The project's boundary map from 081, if any. */
  boundary: BoundaryResult;
  /** Text a candidate owns — its specs and corpus documents, keyed by unit. */
  textByUnit: Readonly<Record<string, string>>;
  /** Units that have specced something like this before, keyed by unit. */
  priorArtByUnit?: Readonly<Record<string, string[]>>;
}

/**
 * Build one candidate per unit, with whatever evidence exists for it.
 *
 * A unit with no evidence at all still becomes a candidate with an empty list —
 * it will simply not rank, which is different from being excluded silently.
 */
export function gatherEvidence(input: EvidenceInput): Candidate[] {
  const candidates: Candidate[] = [];

  // Which units the requirement implicates, from the classes that can know:
  // resemblance and prior art. Keyed by unit → HOW STRONGLY implicated, not merely whether. Structural
  // evidence is relative to these candidates (FR-010), so its strength must
  // reflect theirs: being upstream of a barely-matching candidate is weak
  // evidence, and treating it as full evidence reproduces the same
  // always-outranks defect one level down.
  const implicated = new Map<string, number>();
  for (const unit of input.units) {
    const text = input.textByUnit[unit];
    const overlap = text !== undefined && text !== '' ? lexicalOverlap(input.requirement, text) : 0;
    const prior = (input.priorArtByUnit?.[unit] ?? []).length > 0 ? 1 : 0;
    const strength = Math.max(overlap, prior);
    if (strength > 0) implicated.set(unit, strength);
  }

  for (const unit of [...input.units].sort()) {
    const evidence: Evidence[] = [];

    // Structural: this unit stands upstream of something the requirement
    // implicates. One finding per unit, never one per edge (FR-010).
    //
    // Gathered per inbound edge, this was a popularity count: the
    // most-depended-upon unit accumulated the most points and won every
    // placement identically, whatever the requirement said. Four unrelated
    // requirements on this repository all landed at the same unit, same score.
    const dependants = input.edges.filter((e) => e.to === unit).map((e) => e.from);
    const implicatedDependants = dependants.filter((d) => implicated.has(d) && d !== unit);
    if (implicatedDependants.length > 0) {
      // Strength inherits from the strongest implicated dependant, then gets a
      // bounded bonus for being upstream of several. Inheriting is what keeps
      // structural evidence *able* to outrank resemblance (FR-003) without
      // outranking it unconditionally — the distinction FR-010 turns on.
      const inherited = Math.max(...implicatedDependants.map((d) => implicated.get(d) ?? 0));
      const breadth = Math.min(1, 0.75 + 0.25 * (implicatedDependants.length - 1));
      evidence.push({
        cls: 'structural',
        source: `upstream of ${implicatedDependants.sort().join(', ')}`,
        strength: inherited * breadth,
      });
    }

    // Declared: the project's own boundary map names this unit.
    if (input.boundary.kind === 'mapped' && input.boundary.map.units.includes(unit)) {
      evidence.push({ cls: 'declared', source: `${input.boundary.map.source} boundary map`, strength: 1 });
    }

    // Domain: lexical closeness, the weak signal.
    const text = input.textByUnit[unit];
    if (text !== undefined && text !== '') {
      const overlap = lexicalOverlap(input.requirement, text);
      if (overlap > 0) evidence.push({ cls: 'domain', source: `${unit} artifacts`, strength: overlap });
    }

    // Prior art: this unit has specced something like it before.
    for (const specId of input.priorArtByUnit?.[unit] ?? []) {
      evidence.push({ cls: 'prior-art', source: specId, strength: 1 });
    }

    candidates.push({ unit, evidence });
  }

  return candidates;
}
