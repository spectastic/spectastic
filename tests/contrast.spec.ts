import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// US2 — WCAG AA colour contrast across all four theme×mode combinations
// (NFR-003, SC-003). axe computes against rendered colours, so it holds even
// when webfonts are blocked.
const FIXTURE = '/tests/fixtures/all-components.html';
const combos: Array<[string, string]> = [
  ['spectastic-calm', 'light'],
  ['spectastic-calm', 'dark'],
  ['spectastic-vivid', 'light'],
  ['spectastic-vivid', 'dark'],
];

for (const [theme, mode] of combos) {
  test(`AA contrast · ${theme} · ${mode}`, async ({ page }) => {
    await page.goto(FIXTURE);
    await page.evaluate(
      ({ t, m }) => {
        document.documentElement.setAttribute('data-theme', t);
        document.documentElement.setAttribute('data-mode', m);
      },
      { t: theme, m: mode }
    );
    // The FR-008 cross-fade animates colour over .35s; measure the SETTLED state
    // so axe reads final colours, not a mid-transition blend.
    await page.waitForTimeout(450);
    const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    const offenders = results.violations.flatMap((v) =>
      v.nodes.map((n) => `${n.target}\n    ${n.failureSummary?.split('\n').pop()?.trim()}`)
    );
    expect(offenders, `contrast failures:\n${offenders.join('\n')}`).toEqual([]);
  });
}
