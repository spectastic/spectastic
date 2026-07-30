import { expect, test } from '@playwright/test';

// US3 — legacy preference migration (FR-006, SC-005). The old `spectastic-theme`
// key stored a MODE ('light'|'dark'); it must migrate into `spectastic-mode`
// with the theme defaulting to calm, preserving the visitor's original intent.
const FIXTURE = '/tests/fixtures/all-components.html';

test('legacy spectastic-theme="dark" becomes dark mode + calm theme', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('spectastic-theme', 'dark'));
  await page.goto(FIXTURE);
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'spectastic-calm');
  const stored = await page.evaluate(() => ({
    theme: localStorage.getItem('spectastic-theme'),
    mode: localStorage.getItem('spectastic-mode'),
  }));
  expect(stored).toEqual({ theme: 'spectastic-calm', mode: 'dark' });
});

test('legacy spectastic-theme="light" migrates the same way', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('spectastic-theme', 'light'));
  await page.goto(FIXTURE);
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'spectastic-calm');
});
