import { expect, test } from '@playwright/test';

// US1 — pick a typographic theme. Targets the contrast fixture, which loads the
// shared assets (theme-boot.js + spec.js) exactly like a real artifact.
const FIXTURE = '/tests/fixtures/all-components.html';

test.describe('US1 · theme switch (FR-001, SC-001)', () => {
  // The registry is no longer a closed pair. 016 SC-004 always anticipated "adding a
  // third theme", and the 2026-08-19 amendment (FR-002 + NFR-005) permitted one, so
  // 109-prose-theme registers `spectastic-prose`. Order is the registry's own order.
  test('the switcher lists every registered theme, in registry order', async ({ page }) => {
    await page.goto(FIXTURE);
    const select = page.locator('select.theme-select:visible');
    await expect(select).toBeVisible();
    const values = await select.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    expect(values).toEqual(['spectastic-calm', 'spectastic-vivid', 'spectastic-prose']);
  });

  test('choosing heavy sets data-theme and persists across reload', async ({ page }) => {
    await page.goto(FIXTURE);
    await page.locator('select.theme-select:visible').selectOption('spectastic-vivid');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'spectastic-vivid');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'spectastic-vivid');
    await expect(page.locator('select.theme-select:visible')).toHaveValue('spectastic-vivid');
  });

  test('the theme carries to another artifact on the same origin', async ({ page }) => {
    await page.goto(FIXTURE);
    await page.locator('select.theme-select:visible').selectOption('spectastic-vivid');
    await page.goto('/tests/fixtures/other.html');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'spectastic-vivid');
  });
});
