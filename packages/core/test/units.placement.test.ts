import { describe, expect, it } from 'vitest';
import { gatherEvidence, lexicalOverlap } from '../src/units/adapters/placement-evidence.js';
import { type Candidate, rankPlacement } from '../src/units/placement.js';

/**
 * The placement verdict (spec 082-placement-verdict).
 *
 * The headline is the case the whole slice exists for: a requirement written in
 * a consumer's vocabulary, with a structural edge to the producer, must rank
 * the producer first. A ranking resemblance can always win reproduces the
 * producer/consumer failure by construction, which is the survey's central
 * finding made mechanical.
 */

const PRODUCER = 'spectastic://acme/payments/unit/@acme/ledger';
const CONSUMER = 'spectastic://acme/checkout/unit/@acme/checkout';

describe('US1 · the producer/consumer case (082 T-100, FR-003/SC-001)', () => {
  it('ranks the producer first despite the requirement resembling the consumer', () => {
    const candidates: Candidate[] = [
      {
        // The requirement borrowed this unit's words, so resemblance is strong.
        unit: CONSUMER,
        evidence: [{ cls: 'domain', source: 'specs/012-checkout/spec.html', strength: 1 }],
      },
      {
        // ...but the dependency runs this way, and that is what decides.
        unit: PRODUCER,
        evidence: [{ cls: 'structural', source: `${CONSUMER} → ${PRODUCER}`, strength: 1 }],
      },
    ];

    const verdict = rankPlacement(candidates);
    expect(verdict.kind).toBe('placement');
    if (verdict.kind !== 'placement') return;
    expect(verdict.ranked[0]?.unit).toBe(PRODUCER);
    // And the disagreement is visible rather than silently resolved (FR-008).
    expect(verdict.conflicts).toHaveLength(1);
    expect(verdict.conflicts[0]).toContain(PRODUCER);
    expect(verdict.conflicts[0]).toContain(CONSUMER);
  });
});

describe('US1 · evidence is typed and attributable (082 T-101, FR-002)', () => {
  it('carries every finding with its class and source', () => {
    const verdict = rankPlacement([
      {
        unit: PRODUCER,
        evidence: [
          { cls: 'structural', source: 'edge', strength: 1 },
          { cls: 'declared', source: 'boundary map', strength: 1 },
        ],
      },
    ]);
    expect(verdict.kind).toBe('placement');
    if (verdict.kind !== 'placement') return;
    const top = verdict.ranked[0];
    expect(top?.classes).toEqual(['declared', 'structural']);
    expect(top?.evidence.every((e) => e.source !== '')).toBe(true);
  });
});

describe('US1 · determinism (082 T-103, NFR-003/SC-005)', () => {
  it('is independent of input order', () => {
    const a: Candidate = {
      unit: 'spectastic://p/p/unit/a',
      evidence: [{ cls: 'structural', source: 's', strength: 1 }],
    };
    const b: Candidate = {
      unit: 'spectastic://p/p/unit/b',
      evidence: [{ cls: 'structural', source: 's', strength: 1 }],
    };
    const one = rankPlacement([a, b]);
    const two = rankPlacement([b, a]);
    expect(one).toEqual(two);
  });

  it('records its mode, so a reader can tell a reproducible verdict from a refined one (082 T-900, D-001)', () => {
    const c: Candidate = { unit: PRODUCER, evidence: [{ cls: 'structural', source: 's', strength: 1 }] };
    expect(rankPlacement([c]).mode).toBe('deterministic');
    expect(rankPlacement([c], { mode: 'refined' }).mode).toBe('refined');
  });
});

describe('US2 · no confident owner is a first-class answer (082 T-200, FR-005/SC-002)', () => {
  it('abstains rather than naming the least-bad candidate', () => {
    // Forced choice over a ranked list always returns something, and what it
    // returns is the unit whose vocabulary the requirement borrowed.
    const verdict = rankPlacement([{ unit: CONSUMER, evidence: [{ cls: 'domain', source: 'weak', strength: 0.2 }] }]);
    expect(verdict.kind).toBe('no-confident-owner');
    if (verdict.kind !== 'no-confident-owner') return;
    expect(verdict.reasons.length).toBeGreaterThan(0);
    // It still shows what it considered — abstention is not silence.
    expect(verdict.ranked).toHaveLength(1);
  });

  it('proposes a new unit when there is no candidate at all, and creates nothing', () => {
    const verdict = rankPlacement([]);
    expect(verdict.kind).toBe('propose-new-unit');
    if (verdict.kind !== 'propose-new-unit') return;
    expect(verdict.reasons.length).toBeGreaterThan(0);
  });
});

describe('US2 · domain evidence alone never reaches the unhedged band (082 T-201, FR-009/SC-004)', () => {
  it('caps a resemblance-only candidate at low confidence, hedged', () => {
    // The configuration that produces the opening failure. Even at full
    // strength across several sources, resemblance alone cannot place.
    const verdict = rankPlacement([
      {
        unit: CONSUMER,
        evidence: [
          { cls: 'domain', source: 'spec-a', strength: 1 },
          { cls: 'domain', source: 'spec-b', strength: 1 },
          { cls: 'domain', source: 'corpus-doc', strength: 1 },
        ],
      },
    ]);
    expect(verdict.kind).toBe('placement');
    if (verdict.kind !== 'placement') return;
    expect(verdict.confidence).toBe('low');
    expect(verdict.hedged).toBe(true);
  });

  it('a structural signal lifts the same candidate out of the cap', () => {
    const verdict = rankPlacement([
      {
        unit: CONSUMER,
        evidence: [
          { cls: 'domain', source: 'spec-a', strength: 1 },
          { cls: 'structural', source: 'edge', strength: 1 },
        ],
      },
    ]);
    expect(verdict.kind === 'placement' && verdict.confidence).not.toBe('low');
  });
});

describe('US1 · a tie at the top hedges rather than breaking arbitrarily (082 T-111, FR-004)', () => {
  it('reports the tie as hedged', () => {
    const verdict = rankPlacement([
      { unit: 'spectastic://p/p/unit/a', evidence: [{ cls: 'structural', source: 's', strength: 1 }] },
      { unit: 'spectastic://p/p/unit/b', evidence: [{ cls: 'structural', source: 's', strength: 1 }] },
    ]);
    expect(verdict.kind === 'placement' && verdict.hedged).toBe(true);
  });
});

describe('degradation', () => {
  it('a nonsense strength is clamped rather than trusted', () => {
    const verdict = rankPlacement([
      { unit: PRODUCER, evidence: [{ cls: 'structural', source: 's', strength: Number.NaN }] },
    ]);
    // NaN contributes 0, so this cannot reach the floor — it abstains rather
    // than scoring NaN and comparing unpredictably.
    expect(verdict.kind).toBe('no-confident-owner');
  });

  it('never throws on hostile evidence', () => {
    expect(() => rankPlacement([{ unit: '', evidence: [{ cls: 'domain', source: '', strength: -5 }] }])).not.toThrow();
  });
});

describe('US3 · evidence gathering (082 T-300/T-301)', () => {
  const REQUIREMENT = 'settlement amounts are rounded incorrectly on the ledger balance';

  it('gathers all four classes from what 079 and 081 already produce', () => {
    const candidates = gatherEvidence({
      requirement: REQUIREMENT,
      units: [PRODUCER, CONSUMER],
      edges: [{ from: CONSUMER, to: PRODUCER, origin: 'inferred', marks: { verified: false, reciprocated: false } }],
      boundary: {
        kind: 'mapped',
        map: { source: 'nx', units: [PRODUCER], permitted: [] },
      },
      textByUnit: {
        [PRODUCER]: 'ledger balance settlement rounding rules',
        [CONSUMER]: 'checkout basket totals and payment capture',
      },
      priorArtByUnit: { [PRODUCER]: ['specs/031-ledger-rounding'] },
    });

    const producer = candidates.find((c) => c.unit === PRODUCER);
    expect(producer?.evidence.map((e) => e.cls).sort()).toEqual(['declared', 'domain', 'prior-art', 'structural']);
    // Every finding is attributable — a piece with no source is not evidence.
    expect(producer?.evidence.every((e) => e.source !== '')).toBe(true);
  });

  it('lexical overlap discriminates between candidates rather than scoring alike', () => {
    // If it did not, ranking would be noise dressed as signal.
    const near = lexicalOverlap(REQUIREMENT, 'ledger balance settlement rounding rules');
    const far = lexicalOverlap(REQUIREMENT, 'button colours and spacing on the profile page');
    expect(near).toBeGreaterThan(far);
    expect(far).toBe(0);
  });

  it('normalises against the requirement, so a large candidate cannot win on volume alone', () => {
    const focused = lexicalOverlap('ledger rounding', 'ledger rounding');
    const sprawling = lexicalOverlap('ledger rounding', `ledger rounding ${'unrelated words '.repeat(200)}`);
    expect(focused).toBe(sprawling); // both cover the requirement fully
  });

  it('drops stopwords, or every candidate would match on filler', () => {
    expect(lexicalOverlap('the and of to', 'completely unrelated text')).toBe(0);
  });

  it('a unit with no evidence is still a candidate, not silently excluded', () => {
    const candidates = gatherEvidence({
      requirement: REQUIREMENT,
      units: [CONSUMER],
      edges: [],
      boundary: { kind: 'none' },
      textByUnit: {},
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.evidence).toEqual([]);
  });
});
