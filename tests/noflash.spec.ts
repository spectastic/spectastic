import { expect, test } from '@playwright/test';

// US3 — return without a flash (NFR-001, SC-002) + JS-off baseline (NFR-002).
const FIXTURE = '/tests/fixtures/all-components.html';

test('a saved non-default selection is applied on load', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('spectastic-theme', 'spectastic-vivid');
    localStorage.setItem('spectastic-mode', 'dark');
  });
  await page.goto(FIXTURE);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'spectastic-vivid');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
});

test('the pre-paint hook is render-blocking in <head> (no-flash guarantee)', async ({ request }) => {
  const res = await request.get(FIXTURE);
  const src = await res.text();
  const head = src.slice(0, src.indexOf('</head>'));
  expect(head).toContain('theme-boot.js');
  // must not be deferred/async — it has to run before first paint
  expect(head).not.toMatch(/theme-boot\.js[^>]*(?:defer|async)/);
});

test('renders fully in the default look with JavaScript disabled (NFR-002)', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(FIXTURE);
  await expect(page.locator('main h1')).toBeVisible();
  const bg = await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe('rgb(246, 245, 241)'); // light default ground #f6f5f1
  await ctx.close();
});
