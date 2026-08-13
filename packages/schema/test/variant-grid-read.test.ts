import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser.js';
import { readVariantGrid } from '../src/variant-grid.js';

/**
 * Reading the grid (spec 096-visual-variant-grid, FR-001, design D-003).
 *
 * The reader is deliberately ORDER-PRESERVING, because document order *is* the
 * resolution order. An `order=` attribute would have been explicit too, and
 * would have introduced a second ordering that can disagree with the first —
 * at which point a reader has to know which wins. P-1 already guarantees source
 * order is reading order, so this reuses an invariant rather than adding one.
 */

const doc = (body: string) => parse(`<!doctype html><html><body>${body}</body></html>`, 'visual/variants.html');

const GRID = `<spec-variant-grid>
  <spec-axis name="platform" default="ios" selects="interaction">
    <spec-context name="ios"><spec-baseline designed="iOS 26.0" verified="iOS 26.1"/></spec-context>
    <spec-context name="macos"><spec-baseline designed="macOS 26.0" verified="none"/></spec-context>
    <spec-context name="tv" declined><p>A converter wants a keyboard.</p></spec-context>
  </spec-axis>
  <spec-axis name="mode" default="light">
    <spec-context name="light"></spec-context>
    <spec-context name="dark"></spec-context>
  </spec-axis>
  <spec-same axes="platform=macos mode=dark"><p>Checked — resolves identically.</p></spec-same>
</spec-variant-grid>`;

describe('axes come back in document order', () => {
  it('preserves declaration order rather than sorting', () => {
    // Sorted would give mode, platform. Document order is the contract.
    expect(readVariantGrid(doc(GRID)).axes.map((a) => a.name)).toEqual(['platform', 'mode']);
  });

  it('preserves context order within an axis', () => {
    const axis = readVariantGrid(doc(GRID)).axes[0];
    expect(axis?.contexts.map((c) => c.name)).toEqual(['ios', 'macos', 'tv']);
  });
});

describe('what each element carries', () => {
  const grid = readVariantGrid(doc(GRID));

  it('reads an axis default and what it selects', () => {
    expect(grid.axes[0]).toMatchObject({ name: 'platform', default: 'ios', selects: 'interaction' });
  });

  it('marks a declined context and keeps its reason as content', () => {
    const tv = grid.axes[0]?.contexts.find((c) => c.name === 'tv');
    expect(tv?.declined).toBe(true);
    expect(tv?.reason).toMatch(/keyboard/);
  });

  it('reads a baseline, including a never-verified one as a value', () => {
    const macos = grid.axes[0]?.contexts.find((c) => c.name === 'macos');
    expect(macos?.baseline).toMatchObject({ designed: 'macOS 26.0', verified: 'none' });
  });

  it('reads a recorded same-as combination', () => {
    expect(grid.same).toHaveLength(1);
    expect(grid.same[0]?.axes).toEqual({ platform: 'macos', mode: 'dark' });
  });
});

describe('a document with no grid', () => {
  it('returns an empty grid rather than throwing', () => {
    const grid = readVariantGrid(doc('<p>an ordinary artifact</p>'));
    expect(grid.axes).toEqual([]);
    expect(grid.same).toEqual([]);
  });
});

describe('NFR-002 · deterministic and side-effect free', () => {
  it('produces byte-identical output across 3 consecutive runs', () => {
    const runs = [1, 2, 3].map(() => JSON.stringify(readVariantGrid(doc(GRID))));
    expect(new Set(runs).size).toBe(1);
  });

  it('reaches for no network, clock or environment — asserted over the module', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { join } = await import('node:path');
    const here = fileURLToPath(import.meta.url);
    const root = here.slice(0, here.indexOf('/packages/schema/'));
    const src = readFileSync(join(root, 'packages/schema/src/variant-grid.ts'), 'utf8');
    expect(src).not.toMatch(/fetch\(|node:https?|node:fs|Date\.|process\.env/);
  });
});
