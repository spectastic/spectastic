import { describe, expect, it, vi } from 'vitest';
import type { DiffResult } from '../src/change-risk/diff.js';
import { scan } from '../src/change-risk/scan.js';
import { score } from '../src/change-risk/score.js';

/**
 * Perf regression test (spec 049 NFR-003, SC-004): scan()+score() over a
 * synthetic 1,000-line diff complete at p95 < 2 s, in-process, with no
 * network access — asserted, not assumed, via a `fetch` spy.
 */

function syntheticDiff(totalLines: number, fileCount: number): DiffResult {
  const linesPerFile = Math.floor(totalLines / fileCount);
  let patch = '';
  for (let i = 0; i < fileCount; i++) {
    const file = `src/module-${i}.ts`;
    patch += `diff --git a/${file} b/${file}\nindex 1111111..2222222 100644\n--- a/${file}\n+++ b/${file}\n@@ -1,${linesPerFile} +1,${linesPerFile} @@\n`;
    for (let j = 0; j < linesPerFile; j++) {
      patch += `+export const value${i}_${j} = ${j};\n`;
    }
  }
  const numstat = `${Array.from({ length: fileCount }, (_, i) => `${linesPerFile}\t0\tsrc/module-${i}.ts`).join('\n')}\n`;
  return { patch, numstat };
}

describe('change-risk perf (NFR-003, SC-004)', () => {
  it('scans + scores a synthetic 1,000-line diff at p95 < 2 s, in-process, with no network calls', () => {
    const diff = syntheticDiff(1000, 20);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const ITERATIONS = 25;
    const timings: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      const findings = scan(diff);
      score(findings, {});
      timings.push(performance.now() - start);
    }

    timings.sort((a, b) => a - b);
    const p95 = timings[Math.floor(timings.length * 0.95)] ?? 0;
    expect(p95, `p95 was ${p95.toFixed(2)}ms`).toBeLessThan(2000);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
