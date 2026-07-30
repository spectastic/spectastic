import { expect, test } from '@playwright/test';
import { EMPTY_GRAPH, UNKNOWN_GRAPH } from './fixtures/graph.js';

// US1 / T-103 (spec FR-011). The panel renders a calm empty/first-run state and
// degrades an unparseable artifact to an unknown node instead of crashing.
const HARNESS = '/tests/vscode/fixtures/canvas-harness.html';

test('shows a calm empty / first-run state when the spec has no artifacts', async ({ page }) => {
  await page.goto(HARNESS);
  await page.evaluate((graph) => window.postMessage({ type: 'graph', graph }, '*'), EMPTY_GRAPH);
  await expect(page.locator('.empty-state')).toBeVisible();
  await expect(page.locator('.node')).toHaveCount(0);
});

test('degrades a malformed artifact to an unknown node, panel survives', async ({ page }) => {
  await page.goto(HARNESS);
  await page.evaluate((graph) => window.postMessage({ type: 'graph', graph }, '*'), UNKNOWN_GRAPH);
  await page.waitForSelector('.node');
  await expect(page.locator('.node[data-unknown="true"]')).toHaveCount(1);
  await expect(page.locator('.node[data-id="spec"] .metric')).toHaveText('unknown');
});
