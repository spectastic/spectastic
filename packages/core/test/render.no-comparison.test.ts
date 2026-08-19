import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * A guard for a requirement the render verb is about to gain the shape to
 * violate: it MUST NOT compare a capture against a previous capture, another
 * image, or a running implementation (spec 106-visual-render, FR-010).
 *
 * FR-010's own rationale: comparing a render against a stored render is pixel
 * diffing with extra steps, and inherits every one of that approach's failure
 * modes — font rendering, anti-aliasing, a baseline re-approved on every
 * legitimate change. Fidelity is measured against declared tokens as numbers,
 * never as images. A prohibition with no test is a sentence; this is what
 * turns it into a guarantee (mirrors the existing structural guard in
 * `visual-renders.test.ts` for FR-005 of 094-visual-sidecar-convention).
 *
 * Checked at the source-text level, on purpose: this is meant to fail loudly
 * if someone later reaches for a comparison library or a baseline parameter,
 * not to be a sophisticated static analyzer.
 */

const SOURCE_PATH = new URL('../src/visual/render-capture.ts', import.meta.url);

describe('render.ts — nothing to compare against (FR-010)', () => {
  it('imports no diff or pixel-comparison utility', () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');
    expect(source).not.toMatch(/pixelmatch|looks-same|resemblejs|odiff/i);
  });

  it("the verb's capture entry point takes no baseline argument", () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');
    // T-110 adds the capture-loop entry point, and its own task text says it
    // calls `ctx.render.checkEgress()` directly — anchor on that call rather
    // than a guessed function name, so this keeps working however T-110 names
    // it. Until T-110 lands, no such export exists, which is the red state
    // this test starts in.
    const entryPoint = source.match(
      /export\s+(?:async\s+)?function\s+\w+\s*\(([^)]*)\)[^{]*\{[\s\S]*?checkEgress/
    );
    expect(
      entryPoint,
      'the render verb entry point (the export that calls checkEgress) is not implemented yet — T-110'
    ).not.toBeNull();
    const params = entryPoint?.[1] ?? '';
    expect(params).not.toMatch(/baseline|compareTo|previousCapture/i);
  });
});
