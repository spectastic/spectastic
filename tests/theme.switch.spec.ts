import { test, expect } from '@playwright/test';

// US1 — pick a typographic theme. Targets the contrast fixture, which loads the
// shared assets (theme-boot.js + spec.js) exactly like a real artifact.
const FIXTURE = '/tests/fixtures/all-components.html';

test.describe('US1 · theme switch (FR-001, SC-001)', () => {
  test('the switcher lists calm + heavy', async ({ page }) => {
    await page.goto(FIXTURE);
    const select = page.locator('select.theme-select');
    await expect(select).toBeVisible();
    const values = await select.locator('option').evaluateAll((os) =>
      os.map((o) => (o as HTMLOptionElement).value)
    );
    expect(values).toEqual(['spectastic-calm', 'spectastic-heavy']);
  });

  test('choosing heavy sets data-theme and persists across reload', async ({ page }) => {
    await page.goto(FIXTURE);
    await page.locator('select.theme-select').selectOption('spectastic-heavy');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'spectastic-heavy');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'spectastic-heavy');
    await expect(page.locator('select.theme-select')).toHaveValue('spectastic-heavy');
  });

  test('the theme carries to another artifact on the same origin', async ({ page }) => {
    await page.goto(FIXTURE);
    await page.locator('select.theme-select').selectOption('spectastic-heavy');
    await page.goto('/tests/fixtures/other.html');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'spectastic-heavy');
  });
});
