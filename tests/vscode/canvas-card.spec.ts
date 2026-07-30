import { expect, test } from '@playwright/test';
import { SAMPLE_GRAPH } from './fixtures/graph.js';

// US3 / T-300 (spec FR-005). Hover / focus reveals a compact card of health rows.
const HARNESS = '/tests/vscode/fixtures/canvas-harness.html';

test.beforeEach(async ({ page }) => {
  await page.goto(HARNESS);
  await page.evaluate((graph) => window.postMessage({ type: 'graph', graph }, '*'), SAMPLE_GRAPH);
  await page.waitForSelector('.node');
});

test('the compact card is hidden until a node is hovered', async ({ page }) => {
  await expect(page.locator('.compact-card')).toHaveCount(0);
});

test('hovering a node reveals a compact card with health rows', async ({ page }) => {
  await page.locator('.node[data-id="spec"]').hover();
  const card = page.locator('.compact-card');
  await expect(card).toBeVisible();
  await expect(card.locator('dt')).not.toHaveCount(0);
  await expect(card.locator('dd', { hasText: 'review' })).toBeVisible();
});

test('shows at most five rows (calm density)', async ({ page }) => {
  await page.locator('.node[data-id="spec"]').hover();
  const rows = await page.locator('.compact-card dt').count();
  expect(rows).toBeLessThanOrEqual(5);
});

test('the popover stays inside the viewport, not clipped (regression)', async ({ page }) => {
  // Shrink the panel so a naive "below the node" position would overflow.
  await page.setViewportSize({ width: 360, height: 220 });
  await page.locator('.node[data-id="tasks"]').hover();
  const card = page.locator('.compact-card');
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  const vw = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(vw.height + 1);
});
