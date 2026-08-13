import { expect, test } from '@playwright/test';

/**
 * The journey chain (100-screen-flows, NFR-001, P-13).
 *
 * The assertion that matters is that meaning is carried in TEXT. A flow drawn
 * only as arrows puts its content in geometry, which a screen reader cannot
 * see — so these read computed content, and the containment checks exist
 * because a chain that renders and overspills passes every "it rendered" test.
 */

const FIXTURE = '/tests/fixtures/screen-flow.html';
const THEMES = ['spectastic-calm', 'spectastic-vivid'] as const;

const setTheme = (page: import('@playwright/test').Page, theme: string) =>
  page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

const before = (page: import('@playwright/test').Page, sel: string) =>
  page.locator(sel).evaluate((el) => getComputedStyle(el, '::before').content ?? '');

for (const theme of THEMES) {
  test(`each step names its screen and state in text · ${theme}`, async ({ page }) => {
    await page.goto(FIXTURE);
    await setTheme(page, theme);
    expect(await before(page, '#s1')).toContain('convert');
    expect(await before(page, '#s1')).toContain('empty');
    expect(await before(page, '#s3')).toContain('converted');
  });

  test(`a declared boundary says so in words rather than as a gap · ${theme}`, async ({ page }) => {
    await page.goto(FIXTURE);
    await setTheme(page, theme);
    expect(await before(page, '#s4')).toMatch(/leaves the feature/i);
  });
}

test('a branch reads as a branch, not as another step', async ({ page }) => {
  await page.goto(FIXTURE);
  expect(await before(page, '#b1')).toMatch(/on failure/i);
  const style = await page.locator('#b1').evaluate((el) => {
    const s = getComputedStyle(el);
    return { borderLeftStyle: s.borderLeftStyle, marginLeft: Number.parseFloat(s.marginLeft) };
  });
  // Indented and dashed: the failure path is the half people skip, so it must
  // not look ordinary.
  expect(style.borderLeftStyle).toBe('dashed');
  expect(style.marginLeft).toBeGreaterThan(0);
});

test('a branch names where it goes', async ({ page }) => {
  await page.goto(FIXTURE);
  const after = await page.locator('#b1').evaluate((el) => getComputedStyle(el, '::after').content ?? '');
  expect(after).toContain('convert');
});

test('a step naming no screen renders visibly broken without a rule running', async ({ page }) => {
  await page.goto(FIXTURE);
  expect(await before(page, '#s-bad')).toMatch(/MISSING SCREEN/i);
});

for (const width of [390, 1440]) {
  test(`the chain stays inside the page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(FIXTURE);
    const overspill = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overspill).toBeLessThanOrEqual(1);
  });
}
