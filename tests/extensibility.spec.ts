import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Polish — SC-004 (under the D-006 component-override model): adding a theme is
// one self-contained, attribute-scoped stylesheet SECTION (token block + its
// component rules) + one registry entry, with zero artifact-markup edits and
// zero switch-logic changes. Verified structurally.
const FIXTURE = '/tests/fixtures/all-components.html';

test('the switcher is generated from the registry (no per-artifact markup)', async ({ page }) => {
  await page.goto(FIXTURE);
  const { optionValues, registryIds } = await page.evaluate(() => ({
    optionValues: [...document.querySelectorAll('select.theme-select option')].map(
      (o) => (o as HTMLOptionElement).value
    ),
    registryIds: (window as any).__spectastic.THEMES.map((t: any) => t.id),
  }));
  expect(optionValues).toEqual(registryIds);
  expect(optionValues.length).toBeGreaterThanOrEqual(2);
});

test('a theme is a self-contained attribute-scoped section + registry entry', () => {
  const css = readFileSync('assets/spec.css', 'utf8');
  const total = (css.match(/spectastic-heavy/g) || []).length;
  const scoped = (css.match(/\[data-theme="spectastic-heavy"\]/g) || []).length;
  expect(scoped, 'heavy theme has stylesheet rules').toBeGreaterThan(0);
  // every mention of the theme is inside a [data-theme] selector — no bare/global
  // leakage, so the theme is additive and removable as a unit (D-006/D-008).
  expect(total, 'every heavy mention is attribute-scoped').toBe(scoped);
  // the registry (single source) carries the same id
  const boot = readFileSync('assets/theme-boot.js', 'utf8');
  expect(boot).toContain('spectastic-heavy');
});
