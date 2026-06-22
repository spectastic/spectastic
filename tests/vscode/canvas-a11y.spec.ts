import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { SAMPLE_GRAPH } from './fixtures/graph.js';

// Polish / T-901 (spec NFR-003, also exercises FR-012). The canvas must stay
// legible with WCAG AA contrast in both light and dark VS Code themes.
const HARNESS = '/tests/vscode/fixtures/canvas-harness.html';

for (const theme of ['vscode-light', 'vscode-dark'] as const) {
  test(`no serious accessibility violations in ${theme}`, async ({ page }) => {
    await page.goto(HARNESS);
    await page.evaluate((t) => {
      document.body.className = t;
    }, theme);
    await page.evaluate((graph) => window.postMessage({ type: 'graph', graph }, '*'), SAMPLE_GRAPH);
    await page.waitForSelector('.node');

    const results = await new AxeBuilder({ page })
      .include('#canvas-root')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
}
