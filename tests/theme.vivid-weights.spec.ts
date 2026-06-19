import { test, expect } from '@playwright/test';

// US1 — vivid is heavier (FR-007), and a theme owns type/structure but NOT
// colour (FR-002). getComputedStyle returns the specified font-weight whether
// or not the webfont file loaded, so these assertions hold offline.
const FIXTURE = '/tests/fixtures/all-components.html';

const weight = (page, sel: string) =>
  page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontWeight);
const cssVar = (page, name: string) =>
  page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name
  );

test('vivid raises heading weights vs calm; colour tokens are theme-invariant', async ({ page }) => {
  await page.goto(FIXTURE);
  const calmH1 = Number(await weight(page, 'main h1'));
  const calmH2 = Number(await weight(page, 'main h2'));
  const calmLink = await cssVar(page, '--c-link');

  await page.locator('select.theme-select').selectOption('spectastic-vivid');
  const heavyH1 = Number(await weight(page, 'main h1'));
  const heavyH2 = Number(await weight(page, 'main h2'));
  const heavyLink = await cssVar(page, '--c-link');

  // The reference raises HEADING weights (h1 400→500, h2 300→540); body stays 400.
  expect(heavyH1).toBeGreaterThan(calmH1);
  expect(heavyH2).toBeGreaterThan(calmH2);
  // colour is owned by the mode, not the theme — switching theme must not move it
  expect(heavyLink).toBe(calmLink);
});

test('vivid matches the reference weight map (measured)', async ({ page }) => {
  await page.goto(FIXTURE);
  await page.locator('select.theme-select').selectOption('spectastic-vivid');
  expect(await cssVar(page, '--fw-h1')).toBe('500'); // reference Fraunces h1
  expect(await cssVar(page, '--fw-h2')).toBe('540'); // reference section headings
});

test('switching theme requests no additional font files', async ({ page }) => {
  const fontReqs: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'font') fontReqs.push(r.url());
  });
  await page.goto(FIXTURE);
  await page.waitForLoadState('networkidle').catch(() => {});
  const before = fontReqs.length;
  await page.locator('select.theme-select').selectOption('spectastic-vivid');
  await page.waitForTimeout(400);
  expect(fontReqs.length).toBe(before);
});
