import { expect, test } from '@playwright/test';
import { SAMPLE_GRAPH } from './fixtures/graph.js';

// Polish / T-902 (spec NFR-002, SC-004). A re-post (the watcher's effect) updates
// a node in place — same DOM element, new content — within 500 ms and with no
// full-canvas teardown (flicker-free reconcile).
const HARNESS = '/tests/vscode/fixtures/canvas-harness.html';

test('updates a node in place without re-creating it', async ({ page }) => {
  await page.goto(HARNESS);
  await page.evaluate((graph) => window.postMessage({ type: 'graph', graph }, '*'), SAMPLE_GRAPH);
  await page.waitForSelector('.node[data-id="spec"]');

  // Tag the existing element so we can detect a teardown.
  await page.locator('.node[data-id="spec"]').evaluate((el) => {
    (el as HTMLElement).dataset.probe = 'kept';
  });

  const start = Date.now();
  await page.evaluate((base) => {
    const graph = structuredClone(base);
    const spec = graph.nodes.find((n) => n.id === 'spec');
    if (spec) {
      spec.metric = '20 reqs';
      spec.health.status = 'accepted';
    }
    window.postMessage({ type: 'graph', graph }, '*');
  }, SAMPLE_GRAPH);

  await expect(page.locator('.node[data-id="spec"] .metric')).toHaveText('20 reqs');
  const elapsed = Date.now() - start;

  // Same element survived the update (flicker-free reconcile).
  await expect(page.locator('.node[data-id="spec"]')).toHaveAttribute('data-probe', 'kept');
  expect(elapsed).toBeLessThan(500);
});
