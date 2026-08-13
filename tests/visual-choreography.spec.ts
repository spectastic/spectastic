import { expect, test } from '@playwright/test';

/**
 * Motion as a sequence (102, NFR-001).
 *
 * The offset must render WITH its unit. A bare number is ambiguous — 180 could
 * be milliseconds, frames or nothing — and a render that dropped the unit would
 * pass every structural assertion while being unreadable, which is the exact
 * failure mode this project's browser passes exist for.
 */

const FIXTURE = '/tests/fixtures/choreography.html';
const THEMES = ['spectastic-calm', 'spectastic-vivid'] as const;

const setTheme = (page: import('@playwright/test').Page, theme: string) =>
  page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

const before = (page: import('@playwright/test').Page, sel: string) =>
  page.locator(sel).evaluate((el) => getComputedStyle(el, '::before').content ?? '');

for (const theme of THEMES) {
  test(`each cue renders its offset with the unit, and what moves · ${theme}`, async ({ page }) => {
    await page.goto(FIXTURE);
    await setTheme(page, theme);
    const c1 = await before(page, '#c1');
    expect(c1).toContain('0ms');
    expect(c1).toContain('eyebrow');
    expect(await before(page, '#c3')).toContain('1080ms');
  });

  test(`offsets read as absolute, so two cues are comparable at a glance · ${theme}`, async ({ page }) => {
    await page.goto(FIXTURE);
    await setTheme(page, theme);
    // 180ms is what was authored, and what renders — not a delta from the cue
    // before it, which would make comparing two cues an arithmetic exercise.
    expect(await before(page, '#c2')).toContain('180ms');
  });
}

test('the reduced-motion record reads as a statement, not a footnote', async ({ page }) => {
  await page.goto(FIXTURE);
  expect(await before(page, '#rm')).toMatch(/under reduced motion/i);
  const style = await page.locator('#rm').evaluate((el) => {
    const s = getComputedStyle(el);
    return { display: s.display, borderLeftWidth: Number.parseFloat(s.borderLeftWidth) };
  });
  expect(style.display).toBe('block');
  expect(style.borderLeftWidth).toBeGreaterThan(0);
});

test('an empty reduced-motion record renders broken without a rule running', async ({ page }) => {
  await page.goto(FIXTURE);
  expect(await before(page, '#rm-empty')).toMatch(/NOT RECORDED/i);
});

test('a missing origin and a missing offset both render broken', async ({ page }) => {
  await page.goto(FIXTURE);
  expect(await before(page, '#broken')).toMatch(/MISSING ORIGIN/i);
  expect(await before(page, '#c-bad')).toMatch(/MISSING OFFSET/i);
});

for (const width of [390, 1440]) {
  test(`the timeline stays inside the page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(FIXTURE);
    const overspill = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overspill).toBeLessThanOrEqual(1);
  });
}
