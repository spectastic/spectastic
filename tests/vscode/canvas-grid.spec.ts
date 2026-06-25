import { test, expect } from '@playwright/test';
import { SAMPLE_GRAPH } from './fixtures/graph.js';

// I-036 — the dotted grid must fill the whole panel, not just the cards'
// bounding box. The grid moved from .canvas-surface (sized to the graph
// extent) to #canvas-root (the scroll viewport), which stays full-bleed even
// when the graph is small. Browser-level per the containment discipline:
// a "renders" check can't prove the background actually covers the viewport.
const HARNESS = '/tests/vscode/fixtures/canvas-harness.html';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto(HARNESS);
  await page.evaluate((graph) => window.postMessage({ type: 'graph', graph }, '*'), SAMPLE_GRAPH);
  await page.waitForSelector('.node');
});

test('the dotted grid lives on the viewport and fills it for a small graph', async ({ page }) => {
  const root = page.locator('#canvas-root');
  // The grid is on #canvas-root...
  await expect(root).toHaveCSS('background-image', /radial-gradient/);
  // ...and #canvas-root fills the viewport even though the sample graph is short.
  const { rootH, vh, surfH } = await page.evaluate(() => ({
    rootH: document.getElementById('canvas-root')!.clientHeight,
    vh: window.innerHeight,
    surfH: document.querySelector<HTMLElement>('.canvas-surface')!.offsetHeight,
  }));
  expect(surfH).toBeLessThan(vh); // the cards' box is shorter than the panel...
  expect(rootH).toBeGreaterThanOrEqual(vh - 2); // ...but the grid-bearing root still fills it.
});

test('the surface no longer carries the grid (moved to the viewport)', async ({ page }) => {
  await expect(page.locator('.canvas-surface')).toHaveCSS('background-image', 'none');
});
