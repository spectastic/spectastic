import { test, expect } from '@playwright/test';
import { SAMPLE_GRAPH } from './fixtures/graph.js';

// US1 / T-100 (spec FR-001, FR-002). Drives the real webview bundle: posts a
// graph and asserts each artifact becomes a minimal node with verb dot, title,
// status pill, one metric, in L→R order, with the fixed 017 brand colour.
const HARNESS = '/tests/vscode/fixtures/canvas-harness.html';

test.beforeEach(async ({ page }) => {
  await page.goto(HARNESS);
  await page.evaluate((graph) => window.postMessage({ type: 'graph', graph }, '*'), SAMPLE_GRAPH);
  await page.waitForSelector('.node');
});

test('renders one minimal node per artifact', async ({ page }) => {
  await expect(page.locator('.node')).toHaveCount(SAMPLE_GRAPH.nodes.length);
});

test('each node shows verb dot, title, status pill and one metric', async ({ page }) => {
  const spec = page.locator('.node[data-id="spec"]');
  await expect(spec.locator('.verb-dot')).toBeVisible();
  await expect(spec.locator('.title')).toHaveText('099-demo');
  await expect(spec.locator('.pill')).toHaveText('review');
  await expect(spec.locator('.metric')).toHaveText('14 reqs');
});

test('orders the spine along the lifecycle: spec before plan before tasks (vertical default)', async ({
  page,
}) => {
  const box = async (id: string) => (await page.locator(`.node[data-id="${id}"]`).boundingBox())!;
  const spec = await box('spec');
  const plan = await box('plan');
  const tasks = await box('tasks');
  // Default orientation is vertical (FR-004) — the spine runs top-to-bottom.
  expect(spec.y).toBeLessThan(plan.y);
  expect(plan.y).toBeLessThan(tasks.y);
});

test('colours the spec node dot with the fixed 017 brand colour (--spec-2)', async ({ page }) => {
  const color = await page
    .locator('.node[data-id="spec"] .verb-dot')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  // --spec-2 is #960462 in light mode.
  expect(color).toBe('rgb(150, 4, 98)');
});

test('node content does not overspill the box (grows to fit, no crop)', async ({ page }) => {
  // Regression: a fixed-height node clipped its stacked content. Every node's
  // content must fit inside its own border box.
  const overspill = await page.locator('.node').evaluateAll((nodes) =>
    nodes.map((n) => (n as HTMLElement).scrollHeight - (n as HTMLElement).clientHeight),
  );
  for (const delta of overspill) expect(delta).toBeLessThanOrEqual(1);
});

test('a long title is truncated, not wrapped past the box', async ({ page }) => {
  await page.evaluate(() => {
    window.postMessage(
      {
        type: 'graph',
        graph: {
          specId: 'x',
          nodes: [
            {
              id: 'spec',
              verb: 'spec',
              specId: '001-an-unusually-long-spec-identifier-that-would-wrap',
              title: '001-an-unusually-long-spec-identifier-that-would-wrap',
              path: '/x/spec.html',
              health: {
                status: 'draft',
                reqCounts: null,
                reqCount: 0,
                wordCount: 0,
                readMinutes: 0,
                openQuestions: 0,
                risksIdentified: 0,
                budgetBand: null,
              },
              metric: '3 reqs',
              attention: false,
              stale: false,
              unknown: false,
            },
          ],
          edges: [],
        },
      },
      '*',
    );
  });
  const node = page.locator('.node[data-id="spec"]');
  await node.waitFor();
  const delta = await node.evaluate(
    (n) => (n as HTMLElement).scrollHeight - (n as HTMLElement).clientHeight,
  );
  expect(delta).toBeLessThanOrEqual(1);
});
