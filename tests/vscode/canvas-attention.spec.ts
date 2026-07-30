import { expect, test } from '@playwright/test';
import { SAMPLE_GRAPH } from './fixtures/graph.js';

// US3 / T-301 (spec FR-006, SC-002). A node needing attention is visibly distinct
// from a calm one before any card opens; the stale state is also visible.
const HARNESS = '/tests/vscode/fixtures/canvas-harness.html';

test.beforeEach(async ({ page }) => {
  await page.goto(HARNESS);
  await page.evaluate((graph) => window.postMessage({ type: 'graph', graph }, '*'), SAMPLE_GRAPH);
  await page.waitForSelector('.node');
});

test('marks only the at-risk node with the attention state', async ({ page }) => {
  await expect(page.locator('.node[data-attention="true"]')).toHaveCount(1);
  await expect(page.locator('.node[data-id="tasks"]')).toHaveAttribute('data-attention', 'true');
  await expect(page.locator('.node[data-id="spec"]')).toHaveAttribute('data-attention', 'false');
});

test('an attention node is visually distinct from a calm one (SC-002)', async ({ page }) => {
  const border = (id: string) =>
    page.locator(`.node[data-id="${id}"]`).evaluate((el) => getComputedStyle(el).borderColor);
  const attention = await border('tasks');
  const calm = await border('spec');
  expect(attention).not.toBe(calm);
  // --attention is #e1624f.
  expect(attention).toBe('rgb(225, 98, 79)');
});

test('renders a stale node with the stale state', async ({ page }) => {
  await page.evaluate(() => {
    const graph = {
      specId: '099-demo',
      nodes: [
        {
          id: 'spec',
          verb: 'spec',
          specId: '099-demo',
          title: '099-demo',
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
          metric: '—',
          attention: false,
          stale: true,
          unknown: false,
        },
      ],
      edges: [],
    };
    window.postMessage({ type: 'graph', graph }, '*');
  });
  await expect(page.locator('.node[data-id="spec"]')).toHaveAttribute('data-stale', 'true');
  const opacity = await page.locator('.node[data-id="spec"]').evaluate((el) => Number(getComputedStyle(el).opacity));
  expect(opacity).toBeLessThan(1);
});
