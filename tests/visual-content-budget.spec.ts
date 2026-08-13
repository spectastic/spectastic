import { expect, test } from '@playwright/test';

/**
 * Copy as a design constraint (103, NFR-001).
 *
 * Two things must be visibly true. A budget renders its UNIT — a bare number is
 * ambiguous and would pass every structural check while being unreadable. And a
 * refusal must read as a PROHIBITION rather than an example, because it sits
 * beside strings that are merely being described, and mistaking one for the
 * other means shipping the string the list exists to keep out.
 */

const FIXTURE = '/tests/fixtures/content-budget.html';
const THEMES = ['spectastic-calm', 'spectastic-vivid'] as const;

const setTheme = (page: import('@playwright/test').Page, theme: string) =>
  page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

const before = (page: import('@playwright/test').Page, sel: string) =>
  page.locator(sel).evaluate((el) => getComputedStyle(el, '::before').content ?? '');

for (const theme of THEMES) {
  test(`a budget renders its number and its unit · ${theme}`, async ({ page }) => {
    await page.goto(FIXTURE);
    await setTheme(page, theme);
    const b1 = await before(page, '#b1');
    expect(b1).toContain('40');
    expect(b1).toContain('characters');
    const b2 = await before(page, '#b2');
    expect(b2).toContain('words');
  });

  test(`a refusal reads as a prohibition, not an example · ${theme}`, async ({ page }) => {
    await page.goto(FIXTURE);
    await setTheme(page, theme);
    const r = await page.locator('#r1').evaluate((el) => {
      const s = getComputedStyle(el, '::before');
      return { content: s.content ?? '', decoration: s.textDecorationLine };
    });
    expect(r.content).toMatch(/never/i);
    expect(r.content).toContain('Something went wrong');
    // Struck as well as labelled: one signal would be a single point of failure.
    expect(r.decoration).toContain('line-through');
  });
}

test('a scoped refusal says where it applies, since a string can be fine elsewhere', async ({ page }) => {
  await page.goto(FIXTURE);
  expect(await before(page, '#r2')).toContain('anything a user reads');
});

test('a budget with no unit renders broken without a rule running', async ({ page }) => {
  await page.goto(FIXTURE);
  expect(await before(page, '#b-bad')).toMatch(/MISSING UNIT/i);
});

test('a refusal with no reason renders broken', async ({ page }) => {
  await page.goto(FIXTURE);
  const after = await page.locator('#r-bad').evaluate((el) => getComputedStyle(el, '::after').content ?? '');
  expect(after).toMatch(/NO REASON/i);
});

for (const width of [390, 1440]) {
  test(`the budget list stays inside the page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(FIXTURE);
    const overspill = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overspill).toBeLessThanOrEqual(1);
  });
}
