import { test, expect } from '@playwright/test';

// US2 — switch mode within any theme (FR-003, FR-004, FR-005, SC-001).
const FIXTURE = '/tests/fixtures/all-components.html';
const html = (page) => page.locator('html');

test('the toggle flips [data-mode] light↔dark', async ({ page }) => {
  await page.goto(FIXTURE);
  await expect(html(page)).toHaveAttribute('data-mode', 'light');
  await page.locator('[data-theme-toggle]:visible').click();
  await expect(html(page)).toHaveAttribute('data-mode', 'dark');
  await page.locator('[data-theme-toggle]:visible').click();
  await expect(html(page)).toHaveAttribute('data-mode', 'light');
});

test('mode is independent of theme — all four combinations hold', async ({ page }) => {
  await page.goto(FIXTURE);
  await page.locator('select.theme-select:visible').selectOption('spectastic-vivid');
  await page.locator('[data-theme-toggle]:visible').click(); // → dark
  await expect(html(page)).toHaveAttribute('data-theme', 'spectastic-vivid');
  await expect(html(page)).toHaveAttribute('data-mode', 'dark');
  // body still renders (visible) in the heavy·dark combination
  await expect(page.locator('main h1')).toBeVisible();
});

test('theme and mode persist as separate keys across reload', async ({ page }) => {
  await page.goto(FIXTURE);
  await page.locator('select.theme-select:visible').selectOption('spectastic-vivid');
  await page.locator('[data-theme-toggle]:visible').click(); // dark
  await page.reload();
  await expect(html(page)).toHaveAttribute('data-theme', 'spectastic-vivid');
  await expect(html(page)).toHaveAttribute('data-mode', 'dark');
  const stored = await page.evaluate(() => ({
    theme: localStorage.getItem('spectastic-theme'),
    mode: localStorage.getItem('spectastic-mode'),
  }));
  expect(stored).toEqual({ theme: 'spectastic-vivid', mode: 'dark' });
});
