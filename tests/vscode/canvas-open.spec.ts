import { test, expect } from '@playwright/test';
import { SAMPLE_GRAPH } from './fixtures/graph.js';

// US2 / T-200 (spec FR-003). Clicking a node dispatches an `open` message to the
// host with that artifact's path. The host-side render of the artifact webview
// (asWebviewUri + CSP) is unit-covered in open-artifact.test.ts and runs end-to-end
// only under the electron tier; here we prove the click → message contract.
const HARNESS = '/tests/vscode/fixtures/canvas-harness.html';

test.beforeEach(async ({ page }) => {
  await page.goto(HARNESS);
  await page.evaluate((graph) => window.postMessage({ type: 'graph', graph }, '*'), SAMPLE_GRAPH);
  await page.waitForSelector('.node');
});

test('clicking a node posts an open message with the artifact path', async ({ page }) => {
  await page.locator('.node[data-id="spec"]').click();
  const posted = await page.evaluate(() => window.__posted);
  expect(posted).toContainEqual({ type: 'open', path: '/repo/specs/099-demo/spec.html' });
});

test('Enter on a focused node also opens it (keyboard a11y)', async ({ page }) => {
  await page.locator('.node[data-id="plan"]').focus();
  await page.keyboard.press('Enter');
  const posted = await page.evaluate(() => window.__posted);
  expect(posted).toContainEqual({ type: 'open', path: '/repo/specs/099-demo/plan.html' });
});
