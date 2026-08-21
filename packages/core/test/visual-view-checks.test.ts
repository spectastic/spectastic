import { describe, expect, it } from 'vitest';
import { visualViewDriftFindings, visualViewMissingFindings } from '../src/commands/validate.js';
import { materialiseVisualViews } from '../src/visual/materialise-view.js';
import type { FileSystem } from '../src/types.js';

/**
 * The two view checks (099-visual-embedded-view, FR-004/FR-005).
 *
 * They are separate on purpose. A stale view is regenerated; an absent one is
 * generated for the first time. The sibling merged them and lost the ability to
 * report absence entirely.
 */

const SCREEN = (states: string) =>
  `<!doctype html><html><body><main><spec-screen id="convert">${states}</spec-screen></main></body></html>`;
const TWO =
  '<spec-state id="a" source="authored"></spec-state><spec-state id="b" source="derived" from="200"></spec-state>';
const THREE = `${TWO}<spec-state id="c" source="authored"></spec-state>`;

const DESIGN =
  '<!doctype html><html><body><main><spec-visual shape="screens" tokens="t" screens="s/x.screen.html" source="figma"><p>r</p></spec-visual></main></body></html>';

const fsWith = (screen: string): FileSystem =>
  ({
    readFile: async () => screen,
    stat: async () => ({ isFile: true, isDirectory: false }),
    readdir: async () => ['x.screen.html'],
    writeFile: async () => {},
    rename: async () => {},
    mkdir: async () => {},
  }) as unknown as FileSystem;

describe('drift', () => {
  it('is silent immediately after materialising', async () => {
    const fs = fsWith(SCREEN(TWO));
    const out = await materialiseVisualViews(DESIGN, fs, '/repo');
    expect(await visualViewDriftFindings(out, 'design.html', fs, '/repo')).toEqual([]);
  });

  it('reports once when a state is added without regenerating', async () => {
    const out = await materialiseVisualViews(DESIGN, fsWith(SCREEN(TWO)), '/repo');
    const f = await visualViewDriftFindings(out, 'design.html', fsWith(SCREEN(THREE)), '/repo');
    expect(f).toHaveLength(1);
    expect(f[0]?.rule).toBe('visual-view-drift');
  });

  it('clears once the view is regenerated', async () => {
    const stale = await materialiseVisualViews(DESIGN, fsWith(SCREEN(TWO)), '/repo');
    const fresh = await materialiseVisualViews(stale, fsWith(SCREEN(THREE)), '/repo');
    expect(await visualViewDriftFindings(fresh, 'design.html', fsWith(SCREEN(THREE)), '/repo')).toEqual([]);
  });

  it('is silent on a document that declares nothing', async () => {
    const plain = '<!doctype html><html><body><main><p>x</p></main></body></html>';
    expect(await visualViewDriftFindings(plain, 'design.html', fsWith(SCREEN(TWO)), '/repo')).toEqual([]);
  });
});

describe('absence', () => {
  it('reports a declaration carrying no view — the divergence from the contract view', () => {
    const f = visualViewMissingFindings(DESIGN, 'design.html');
    expect(f).toHaveLength(1);
    expect(f[0]?.rule).toBe('visual-view-missing');
  });

  it('is silent once a view is present', async () => {
    const out = await materialiseVisualViews(DESIGN, fsWith(SCREEN(TWO)), '/repo');
    expect(visualViewMissingFindings(out, 'design.html')).toEqual([]);
  });

  it('is silent for an explicit no-surface declaration', () => {
    const none =
      '<!doctype html><html><body><main><spec-visual shape="none"><p>r</p></spec-visual></main></body></html>';
    expect(visualViewMissingFindings(none, 'design.html')).toEqual([]);
  });

  it('is silent for a document with no declaration at all', () => {
    expect(visualViewMissingFindings('<main><p>x</p></main>', 'design.html')).toEqual([]);
  });

  it('names the fix in the hint, since the first encounter should end in one action', () => {
    expect(visualViewMissingFindings(DESIGN, 'design.html')[0]?.fixHint).toMatch(/Materialise the view/);
  });
});

/**
 * 099 T-001 — the two checks must not both fire for one defect.
 *
 * A design that declares a surface and carries no view has never been
 * materialised. `visual-view-missing` says exactly that. Drift also fired,
 * because regeneration differs from a document with no view — and its message,
 * "no longer matches the screens it projects", is false about a view that never
 * existed. Two findings for one defect, one of them untrue.
 */
describe('drift stands down when the view has never existed (T-001)', () => {
  it('reports missing only, not drift, for a never-materialised design', async () => {
    const drift = await visualViewDriftFindings(DESIGN, 'design.html', fsWith(SCREEN(TWO)), '/p');
    const missing = visualViewMissingFindings(DESIGN, 'design.html');
    expect(drift).toEqual([]);
    expect(missing).toHaveLength(1);
  });

  it('still reports drift once a view exists and has gone stale', async () => {
    // Materialise against two states, then let the screen grow a third.
    const { materialiseVisualViews } = await import('../src/visual/materialise-view.js');
    const withView = await materialiseVisualViews(DESIGN, fsWith(SCREEN(TWO)), '/p');
    expect(withView).toContain('<spec-visual-view');
    const drift = await visualViewDriftFindings(withView, 'design.html', fsWith(SCREEN(THREE)), '/p');
    expect(drift).toHaveLength(1);
    expect(visualViewMissingFindings(withView, 'design.html')).toEqual([]);
  });
});
