import { expect, test } from '@playwright/test';

/**
 * What the interface reports (104, NFR-001).
 *
 * The assertion that carries the feature: a field holding something a person
 * TYPED renders visibly differently from one holding a choice. Both are often
 * numbers, they are not the same risk, and a render that made them look alike
 * would defeat the reason the payload is typed at all.
 */

const FIXTURE = '/tests/fixtures/tracking-plan.html';
const THEMES = ['spectastic-calm', 'spectastic-vivid'] as const;

const setTheme = (page: import('@playwright/test').Page, theme: string) =>
  page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

const pseudo = (page: import('@playwright/test').Page, sel: string, which: string) =>
  page.locator(sel).evaluate((el, w) => {
    const s = getComputedStyle(el, w);
    return { content: s.content ?? '', color: s.color, background: s.backgroundColor };
  }, which);

for (const theme of THEMES) {
  test(`a user-input field is visibly distinct from a choice · ${theme}`, async ({ page }) => {
    await page.goto(FIXTURE);
    await setTheme(page, theme);
    const badge = await pseudo(page, '#f-risky', '::after');
    expect(badge.content).toMatch(/from user input/i);
    const safe = await pseudo(page, '#f-safe', '::after');
    expect(safe.content).not.toMatch(/from user input/i);
    // Not merely labelled — coloured too, so it survives a fast scan.
    expect(badge.background).not.toBe('rgba(0, 0, 0, 0)');
  });

  test(`an unanswered gate reads differently from an answered one · ${theme}`, async ({ page }) => {
    await page.goto(FIXTURE);
    await setTheme(page, theme);
    const open = await pseudo(page, '#g-open', '::before');
    const none = await pseudo(page, '#g-none', '::before');
    expect(open.content).toMatch(/unanswered/i);
    // "none" is an ANSWER. Rendering it like an unanswered gate would erase a
    // decision somebody made.
    expect(none.content).toMatch(/answered/i);
    expect(none.content).toContain('none');
    expect(none.color).not.toBe(open.color);
  });
}

test('an event with no fields says it carries no payload', async ({ page }) => {
  await page.goto(FIXTURE);
  const after = await pseudo(page, '#e-empty', '::after');
  expect(after.content).toMatch(/carries no payload/i);
});

test('an untyped field renders broken without a rule running', async ({ page }) => {
  await page.goto(FIXTURE);
  expect((await pseudo(page, '#f-bad', '::before')).content).toMatch(/MISSING TYPE/i);
});

for (const width of [390, 1440]) {
  test(`the plan stays inside the page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(FIXTURE);
    const overspill = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overspill).toBeLessThanOrEqual(1);
  });
}
