import { test, expect } from '@playwright/test';

// T-500 (spec FR-001 + FR-014, plan D-008). A derived-view artifact — verify.html
// — renders as a distinct, statusless node: no status pill, a stale metric, and a
// `data-derived` marker so the webview can treat it outside the verb-coloured spine.
// Write-and-fail-first: the scanner/webview don't support derived nodes yet, so the
// node renders like a plain verb node with no `data-derived` flag.
const HARNESS = '/tests/vscode/fixtures/canvas-harness.html';

function mkNode(
  id: string,
  verb: string,
  health: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    verb,
    specId: '099-demo',
    title: '099-demo',
    path: `/x/${id}.html`,
    health: {
      status: null,
      reqCounts: null,
      reqCount: 0,
      wordCount: 0,
      readMinutes: 0,
      openQuestions: 0,
      risksIdentified: 0,
      budgetBand: null,
      ...health,
    },
    metric: 'x',
    attention: false,
    stale: false,
    unknown: false,
    ...extra,
  };
}

// A bundle whose verify.html drift signal says "stale".
const DERIVED_GRAPH = {
  specId: '099-demo',
  nodes: [
    mkNode('spec', 'spec', { status: 'accepted', reqCount: 5 }, { metric: '5 reqs' }),
    mkNode('verify', 'verify', { status: null }, { metric: 'stale', stale: true, derived: true }),
  ],
  edges: [{ from: 'spec', to: 'verify', kind: 'derived' }],
};

test.beforeEach(async ({ page }) => {
  await page.goto(HARNESS);
  await page.evaluate((g) => window.postMessage({ type: 'graph', graph: g }, '*'), DERIVED_GRAPH);
  // The spine node always renders — proves the graph was accepted.
  await page.waitForSelector('.node[data-id="spec"]');
});

test('a derived-view node renders, marked distinct from the verb spine (FR-014/D-008)', async ({
  page,
}) => {
  const verify = page.locator('.node[data-id="verify"]');
  await expect(verify).toHaveCount(1);
  await expect(verify).toHaveAttribute('data-derived', 'true');
});

test('the derived-view node carries no status pill (FR-014)', async ({ page }) => {
  const pillVisible = await page
    .locator('.node[data-id="verify"] .pill')
    .isVisible()
    .catch(() => false);
  expect(pillVisible).toBe(false);
});

test('the derived-view node shows a stale freshness metric, not a verb metric', async ({ page }) => {
  await expect(page.locator('.node[data-id="verify"] .metric')).toContainText('stale');
});
