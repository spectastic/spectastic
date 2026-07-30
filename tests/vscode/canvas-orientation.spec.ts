import { expect, test } from '@playwright/test';
import { SAMPLE_GRAPH } from './fixtures/graph.js';

// Phase 5 / T-401 (spec FR-004, NFR-004). Vertical is the default spine; the
// host can request horizontal; content stays contained in both.
const HARNESS = '/tests/vscode/fixtures/canvas-harness.html';

async function postGraph(page: import('@playwright/test').Page, orientation?: string): Promise<void> {
  await page.goto(HARNESS);
  await page.evaluate(({ graph, orientation }) => window.postMessage({ type: 'graph', graph, orientation }, '*'), {
    graph: SAMPLE_GRAPH,
    orientation,
  });
  await page.waitForSelector('.node[data-id="tasks"]');
}

const box = (page: import('@playwright/test').Page, id: string) => page.locator(`.node[data-id="${id}"]`).boundingBox();

test('defaults to a vertical spine — nodes stack top-to-bottom', async ({ page }) => {
  await postGraph(page); // no orientation → default vertical
  const spec = (await box(page, 'spec'))!;
  const plan = (await box(page, 'plan'))!;
  const tasks = (await box(page, 'tasks'))!;
  expect(spec.y).toBeLessThan(plan.y);
  expect(plan.y).toBeLessThan(tasks.y);
  // spine shares a column
  expect(Math.abs(spec.x - plan.x)).toBeLessThan(2);
});

test('horizontal orientation runs the spine left-to-right', async ({ page }) => {
  await postGraph(page, 'horizontal');
  const spec = (await box(page, 'spec'))!;
  const plan = (await box(page, 'plan'))!;
  const tasks = (await box(page, 'tasks'))!;
  expect(spec.x).toBeLessThan(plan.x);
  expect(plan.x).toBeLessThan(tasks.x);
  expect(Math.abs(spec.y - plan.y)).toBeLessThan(2);
});

test('content stays contained in both orientations (NFR-004)', async ({ page }) => {
  for (const orientation of [undefined, 'horizontal']) {
    await postGraph(page, orientation);
    const overspill = await page
      .locator('.node')
      .evaluateAll((ns) => ns.map((n) => (n as HTMLElement).scrollHeight - (n as HTMLElement).clientHeight));
    for (const delta of overspill) expect(delta).toBeLessThanOrEqual(1);
  }
});
