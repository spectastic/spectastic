import { expect, test } from '@playwright/test';
import { SAMPLE_GRAPH } from './fixtures/graph.js';

// US1 / T-101 (spec FR-004). Edges render as an SVG layer; the slice edge is
// styled distinctly (branch point), proving lanes are drawn — not just the spine.
const HARNESS = '/tests/vscode/fixtures/canvas-harness.html';

test.beforeEach(async ({ page }) => {
  await page.goto(HARNESS);
  await page.evaluate((graph) => window.postMessage({ type: 'graph', graph }, '*'), SAMPLE_GRAPH);
  await page.waitForSelector('.node');
});

test('draws one path per edge', async ({ page }) => {
  await expect(page.locator('svg.edges path')).toHaveCount(SAMPLE_GRAPH.edges.length);
});

test('marks the child-slice edge as a distinct branch kind', async ({ page }) => {
  await expect(page.locator('svg.edges path[data-kind="slice"]')).toHaveCount(1);
  await expect(page.locator('svg.edges path[data-kind="flow"]')).toHaveCount(2);
});

test('places the child slice on a lane beside the spine (vertical default)', async ({ page }) => {
  const spec = (await page.locator('.node[data-id="spec"]').boundingBox())!;
  const slice = (await page.locator('.node[data-id="slice:099a"]').boundingBox())!;
  // Vertical spine (FR-004) → slices branch perpendicular, to the right.
  expect(slice.x).toBeGreaterThan(spec.x);
});
