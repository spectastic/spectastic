import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain .mjs tooling script, no type declarations by design.
import { computePatchCoverage, parseChangedLines, parseLcov } from './patch-coverage.mjs';

// 068-enterprise-enforce-floor T-117/T-101 (plan D-002). The diff-aware
// coverage gate: git diff's changed lines cross-referenced against lcov's
// per-line hit data, scoped to the 4 core packages, ≥80% floor.

describe('parseLcov', () => {
  it('reads per-line hit counts keyed by file', () => {
    const lcov = [
      'SF:packages/core/src/a.ts',
      'DA:1,1',
      'DA:2,0',
      'DA:3,4',
      'end_of_record',
      'SF:packages/core/src/b.ts',
      'DA:1,0',
      'end_of_record',
    ].join('\n');
    const parsed = parseLcov(lcov);
    expect(parsed.get('packages/core/src/a.ts')).toEqual(
      new Map([
        [1, 1],
        [2, 0],
        [3, 4],
      ]),
    );
    expect(parsed.get('packages/core/src/b.ts')).toEqual(new Map([[1, 0]]));
  });

  it('returns an empty map for empty input', () => {
    expect(parseLcov('').size).toBe(0);
  });
});

describe('parseChangedLines', () => {
  it('collects only added lines, tracking the new-file line cursor across a hunk', () => {
    const diff = [
      'diff --git a/packages/core/src/a.ts b/packages/core/src/a.ts',
      '--- a/packages/core/src/a.ts',
      '+++ b/packages/core/src/a.ts',
      '@@ -10,0 +11,3 @@',
      '+line eleven',
      '+line twelve',
      '+line thirteen',
    ].join('\n');
    const changed = parseChangedLines(diff);
    expect(changed.get('packages/core/src/a.ts')).toEqual(new Set([11, 12, 13]));
  });

  it('ignores deleted files (no +++ target)', () => {
    const diff = [
      'diff --git a/packages/core/src/gone.ts b/packages/core/src/gone.ts',
      '--- a/packages/core/src/gone.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-old line one',
      '-old line two',
    ].join('\n');
    expect(parseChangedLines(diff).size).toBe(0);
  });

  it('handles multiple files in one diff, each with its own line cursor', () => {
    const diff = [
      '--- a/packages/core/src/a.ts',
      '+++ b/packages/core/src/a.ts',
      '@@ -1,0 +2,1 @@',
      '+first file line two',
      '--- a/packages/cli/src/b.ts',
      '+++ b/packages/cli/src/b.ts',
      '@@ -5,0 +6,1 @@',
      '+second file line six',
    ].join('\n');
    const changed = parseChangedLines(diff);
    expect(changed.get('packages/core/src/a.ts')).toEqual(new Set([2]));
    expect(changed.get('packages/cli/src/b.ts')).toEqual(new Set([6]));
  });
});

describe('computePatchCoverage', () => {
  it('scores 100% when every changed, tracked line was hit', () => {
    const changed = new Map([['packages/core/src/a.ts', new Set([1, 2])]]);
    const lcov = new Map([
      [
        'packages/core/src/a.ts',
        new Map([
          [1, 1],
          [2, 3],
        ]),
      ],
    ]);
    const result = computePatchCoverage(changed, lcov);
    expect(result).toEqual({ coveredCount: 2, totalCount: 2, percentage: 100, uncovered: [] });
  });

  it('flags an uncovered changed line and reports it by file:line', () => {
    const changed = new Map([['packages/core/src/a.ts', new Set([1, 2, 3, 4, 5])]]);
    const lcov = new Map([
      [
        'packages/core/src/a.ts',
        new Map([
          [1, 1],
          [2, 1],
          [3, 1],
          [4, 1],
          [5, 0], // the one uncovered line — 4/5 = 80%, exactly at the floor
        ]),
      ],
    ]);
    const result = computePatchCoverage(changed, lcov);
    expect(result.percentage).toBe(80);
    expect(result.uncovered).toEqual([{ file: 'packages/core/src/a.ts', line: 5 }]);
  });

  it('falls below the 80% floor when an uncovered line tips the balance', () => {
    // 3/4 = 75%, under the 80% floor — this is the T-101 proof case: a
    // fixture change with one uncovered line among few should fail the gate.
    const changed = new Map([['packages/core/src/a.ts', new Set([1, 2, 3, 4])]]);
    const lcov = new Map([
      [
        'packages/core/src/a.ts',
        new Map([
          [1, 1],
          [2, 1],
          [3, 1],
          [4, 0],
        ]),
      ],
    ]);
    const result = computePatchCoverage(changed, lcov);
    expect(result.percentage).toBe(75);
    expect(result.percentage).toBeLessThan(80);
  });

  it('excludes changed lines lcov never instrumented (blank/comment/untracked)', () => {
    const changed = new Map([['packages/core/src/a.ts', new Set([1, 2, 99])]]); // 99 not in lcov
    const lcov = new Map([
      [
        'packages/core/src/a.ts',
        new Map([
          [1, 1],
          [2, 1],
        ]),
      ],
    ]);
    const result = computePatchCoverage(changed, lcov);
    expect(result.totalCount).toBe(2);
    expect(result.percentage).toBe(100);
  });

  it('excludes files outside the 4-core-package scope', () => {
    const changed = new Map([['packages/vscode/src/host/extension.ts', new Set([1])]]);
    const lcov = new Map([['packages/vscode/src/host/extension.ts', new Map([[1, 0]])]]);
    const result = computePatchCoverage(changed, lcov);
    expect(result).toEqual({ coveredCount: 0, totalCount: 0, percentage: 100, uncovered: [] });
  });

  it('scores 100% (vacuously) when there are no coverable changed lines', () => {
    const result = computePatchCoverage(new Map(), new Map());
    expect(result.percentage).toBe(100);
    expect(result.totalCount).toBe(0);
  });
});
