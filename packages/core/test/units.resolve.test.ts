import { describe, expect, it } from 'vitest';
import { inferEdgesFromUnits, resolveEdges } from '../src/units/resolve.js';
import type { FarEndVerdict, WorkspaceUnit } from '../src/units/types.js';

/**
 * The pure edge algebra (spec 079-unit-dependency-edge, design D-001).
 *
 * Everything here runs on plain objects — no fixture directories — which is the
 * entire reason the filesystem sits behind a port. The rules under test are the
 * ones that decide what an edge is *worth*, and they are a small state matrix
 * that has to be exactly right.
 */

const SELF = 'spectastic://spectastic/spectastic/unit/@spectastic/core';
const SIBLING = 'spectastic://spectastic/spectastic/unit/@spectastic/cli';
const FOREIGN = 'spectastic://acme/payments/unit/@acme/ledger';

/** Nothing readable anywhere — the default for tests that do not care. */
const silent = (): FarEndVerdict => 'silent';

function unit(name: string, dependsOn: readonly string[] = []): WorkspaceUnit {
  return { name, dir: `packages/${name.split('/').pop()}`, dependsOn };
}

describe('US1 · declared edges resolve (079 T-100, FR-009/FR-010)', () => {
  it('resolves an intra-repo and a cross-repo declaration alike', () => {
    const result = resolveEdges({
      self: SELF,
      declared: [SIBLING, FOREIGN],
      units: [unit('@spectastic/core'), unit('@spectastic/cli')],
      farEnd: silent,
    });

    expect(result.edges.map((e) => e.to).sort()).toEqual([FOREIGN, SIBLING].sort());
    expect(result.edges.every((e) => e.from === SELF)).toBe(true);
    expect(result.edges.every((e) => e.origin === 'declared')).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('treats the same target declared twice as one edge (spec §4 — a set, not a list)', () => {
    const result = resolveEdges({
      self: SELF,
      declared: [SIBLING, SIBLING],
      units: [unit('@spectastic/core'), unit('@spectastic/cli')],
      farEnd: silent,
    });
    expect(result.edges).toHaveLength(1);
  });
});

describe('US1 · a target found nowhere is dangling, not dropped (079 T-101, FR-008)', () => {
  it('reports an in-project coordinate naming no unit', () => {
    // In-project and absent is *knowably* wrong, so it is dangling. A FOREIGN
    // coordinate is a different case entirely — see the unverified tests — since
    // an absent checkout tells us nothing about whether the unit exists.
    const missing = 'spectastic://spectastic/spectastic/unit/@spectastic/ghost';
    const result = resolveEdges({
      self: SELF,
      declared: [missing],
      units: [unit('@spectastic/core')],
      farEnd: silent,
    });

    expect(result.edges).toHaveLength(0);
    expect(result.dangling).toEqual([{ from: SELF, ref: missing }]);
  });

  it('does NOT call a foreign coordinate dangling merely because it is absent', () => {
    const result = resolveEdges({
      self: SELF,
      declared: [FOREIGN],
      units: [unit('@spectastic/core')],
      farEnd: () => 'unreadable',
    });
    expect(result.dangling).toEqual([]);
    expect(result.edges).toHaveLength(1);
  });
});

describe('US1 · a malformed entry degrades rather than aborting (079 T-102, NFR-003)', () => {
  it('reports the bad entry and still resolves the rest', () => {
    const result = resolveEdges({
      self: SELF,
      declared: ['not a coordinate at all', SIBLING],
      units: [unit('@spectastic/core'), unit('@spectastic/cli')],
      farEnd: silent,
    });

    expect(result.edges.map((e) => e.to)).toEqual([SIBLING]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.entry).toBe('not a coordinate at all');
  });

  it('never throws on hostile input', () => {
    expect(() =>
      resolveEdges({
        self: SELF,
        declared: ['', '   ', 'spectastic://', 'http://example.com/x'],
        units: [],
        farEnd: silent,
      }),
    ).not.toThrow();
  });
});

/**
 * US2 · the two marks (079 T-200..T-203, FR-003/FR-004/FR-005).
 *
 * Note on ordering: the mark fields were introduced with the edge shape in
 * T-111, so a couple of these pass on first run. The rules they pin — that the
 * marks stay independent, that agreement must be specific, and that no project
 * can be conscripted — are what the story actually adds.
 */
describe('US2 · the far-end verdict maps onto the two marks (079 T-200)', () => {
  it.each([
    ['agrees', { verified: true, reciprocated: true }],
    ['silent', { verified: true, reciprocated: false }],
    ['unreadable', { verified: false, reciprocated: false }],
  ] as const)('%s → %o', (verdict, expected) => {
    const result = resolveEdges({
      self: SELF,
      declared: [FOREIGN],
      units: [unit('@spectastic/core')],
      farEnd: () => verdict,
    });
    expect(result.edges[0]?.marks).toEqual(expected);
  });
});

describe('US2 · the marks are independent (079 T-201)', () => {
  it('an unverified edge is never reciprocated, whatever the lookup says', () => {
    // The state matrix has three reachable corners, not four: reciprocated
    // implies verified by construction (spec §4).
    const result = resolveEdges({
      self: SELF,
      declared: [FOREIGN],
      units: [],
      farEnd: () => 'unreadable',
    });
    const marks = result.edges[0]?.marks;
    expect(marks?.verified).toBe(false);
    expect(marks?.reciprocated).toBe(false);
  });
});

describe('US2 · agreement must name this unit specifically (079 T-202)', () => {
  it('a far end with unrelated entries does not reciprocate', () => {
    // The risk the design registers: reading a far end's config and mistaking
    // "it has entries" for "it names us".
    const farEnd = (_target: string, depending: string): FarEndVerdict => (depending === SELF ? 'silent' : 'agrees');
    const result = resolveEdges({
      self: SELF,
      declared: [FOREIGN],
      units: [],
      farEnd,
    });
    expect(result.edges[0]?.marks.reciprocated).toBe(false);
  });
});

describe('US2 · no unit can be conscripted (079 T-203, SC-003)', () => {
  it('every resolved edge departs from the declaring project, never a third party', () => {
    const result = resolveEdges({
      self: SELF,
      declared: [SIBLING, FOREIGN],
      units: [unit('@spectastic/core'), unit('@spectastic/cli')],
      farEnd: () => 'agrees',
    });
    // Even where the far end agrees, it is never placed as a depending end by
    // this project's declaration — `from` is always self.
    expect(result.edges.every((e) => e.from === SELF)).toBe(true);
    expect(result.edges.some((e) => e.from === FOREIGN)).toBe(false);
  });
});

describe('US3 · inference and precedence (079 T-302/T-303, FR-006/FR-007, SC-004)', () => {
  const PROJECT = 'spectastic/spectastic';

  it('infers an edge between members from their manifests', () => {
    const edges = inferEdgesFromUnits(PROJECT, [
      unit('@spectastic/core', ['@spectastic/schema', 'lodash']),
      unit('@spectastic/schema'),
    ]);
    expect(edges).toEqual([
      {
        from: 'spectastic://spectastic/spectastic/unit/@spectastic/core',
        to: 'spectastic://spectastic/spectastic/unit/@spectastic/schema',
      },
    ]);
  });

  it('drops a dependency naming no member — an external package is not a unit edge', () => {
    const edges = inferEdgesFromUnits(PROJECT, [unit('@spectastic/core', ['lodash', 'react'])]);
    expect(edges).toEqual([]);
  });

  it('a declaration outranks an inference for the same pair (FR-007)', () => {
    // "Same pair" means same from AND to — an edge's identity is the pair, not
    // the target (spec §4).
    const result = resolveEdges({
      self: SELF,
      declared: [SIBLING],
      units: [unit('@spectastic/core'), unit('@spectastic/cli')],
      farEnd: () => 'agrees',
      inferred: [{ from: SELF, to: SIBLING }],
    });
    const edge = result.edges.find((e) => e.from === SELF && e.to === SIBLING);
    expect(edge?.origin).toBe('declared');
    expect(edge?.marks.reciprocated).toBe(true); // the declaration's marks, not a blank inferred pair
  });

  it('two units depending on the same target are two edges, not one', () => {
    // The regression this pins was found by running the verb on this repository:
    // keying an edge by its target alone silently swallowed every dependant
    // after the first, so three packages depending on one showed a single edge.
    const result = resolveEdges({
      self: SELF,
      declared: [],
      units: [],
      farEnd: silent,
      inferred: [
        { from: 'spectastic://p/p/unit/a', to: 'spectastic://p/p/unit/shared' },
        { from: 'spectastic://p/p/unit/b', to: 'spectastic://p/p/unit/shared' },
      ],
    });
    expect(result.edges).toHaveLength(2);
    expect(result.edges.map((e) => e.from)).toEqual(['spectastic://p/p/unit/a', 'spectastic://p/p/unit/b']);
  });

  it('an inferred edge duplicating a declared one is still one edge (T-303)', () => {
    const result = resolveEdges({
      self: SELF,
      declared: [SIBLING],
      units: [unit('@spectastic/core'), unit('@spectastic/cli')],
      farEnd: silent,
      inferred: [{ from: SELF, to: SIBLING }],
    });
    expect(result.edges.filter((e) => e.to === SIBLING)).toHaveLength(1);
  });

  it('an inferred edge with no declaration survives, marked unverified', () => {
    const result = resolveEdges({
      self: SELF,
      declared: [],
      units: [],
      farEnd: silent,
      inferred: [{ from: SELF, to: SIBLING }],
    });
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]?.origin).toBe('inferred');
    expect(result.edges[0]?.marks).toEqual({ verified: false, reciprocated: false });
  });
});
