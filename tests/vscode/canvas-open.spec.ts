import { expect, test } from '@playwright/test';
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
  expect(posted).toContainEqual({
    type: 'open',
    path: '/repo/specs/099-demo/spec.html',
  });
});

test('Enter on a focused node also opens it (keyboard a11y)', async ({ page }) => {
  await page.locator('.node[data-id="plan"]').focus();
  await page.keyboard.press('Enter');
  const posted = await page.evaluate(() => window.__posted);
  expect(posted).toContainEqual({
    type: 'open',
    path: '/repo/specs/099-demo/plan.html',
  });
});

// Regression: the canvas reconciles nodes by id (spec/plan/tasks are the same
// ids for every spec), so on a spec switch the DOM node is REUSED. The click
// handler must open the CURRENT node's path, not the path it closed over at
// first render — otherwise selecting 002 and clicking "spec" opens 020's file.
test('switching the selected spec rebinds node clicks to the new spec paths', async ({ page }) => {
  await page.locator('.node[data-id="spec"]').click(); // 099-demo

  const otherNode = {
    id: 'spec',
    verb: 'spec',
    specId: '002-validate-cli',
    title: '002-validate-cli',
    path: '/repo/specs/002-validate-cli/spec.html',
    health: {
      status: 'accepted',
      reqCounts: null,
      reqCount: 9,
      wordCount: 0,
      readMinutes: 0,
      openQuestions: 0,
      risksIdentified: 0,
      budgetBand: null,
    },
    metric: '9 reqs',
    attention: false,
    stale: false,
    unknown: false,
  };
  await page.evaluate(
    (n) => window.postMessage({ type: 'graph', graph: { specId: n.specId, nodes: [n], edges: [] } }, '*'),
    otherNode,
  );
  await page.waitForFunction(
    () => document.querySelector('.node[data-id="spec"] .title')?.textContent === '002-validate-cli',
  );

  await page.locator('.node[data-id="spec"]').click();
  const opens = (await page.evaluate(() => window.__posted)).filter((m) => m.type === 'open');
  // The most recent open must be the NEW spec's path, not 099-demo's.
  expect(opens.at(-1)).toEqual({
    type: 'open',
    path: '/repo/specs/002-validate-cli/spec.html',
  });
});
