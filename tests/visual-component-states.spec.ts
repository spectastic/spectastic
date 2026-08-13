import { expect, test } from '@playwright/test';

/**
 * Component interaction states (101, NFR-001).
 *
 * The assertion that carries the feature: a DECLINE must render differently
 * from a DECLARATION. The completeness rule's value is that a blank becomes a
 * question, and it dies quietly if a refused state looks identical to a
 * designed one — a failure every structural check would pass.
 */

const FIXTURE = '/tests/fixtures/component-states.html';
const THEMES = ['spectastic-calm', 'spectastic-vivid'] as const;

const setTheme = (page: import('@playwright/test').Page, theme: string) =>
  page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

const pseudo = (page: import('@playwright/test').Page, sel: string, which: string) =>
  page.locator(sel).evaluate((el, w) => {
    const s = getComputedStyle(el, w);
    return { content: s.content ?? '', decoration: s.textDecorationLine, color: s.color };
  }, which);

for (const theme of THEMES) {
  test(`a declined state is visibly not a declared one · ${theme}`, async ({ page }) => {
    await page.goto(FIXTURE);
    await setTheme(page, theme);

    const declared = await pseudo(page, '#declared', '::before');
    const declined = await pseudo(page, '#declined', '::before');

    expect(declared.content).toContain('resting');
    expect(declined.content).toContain('hover');
    // Three independent signals, because one would be a single point of failure.
    expect(declined.decoration).toContain('line-through');
    expect(declined.color).not.toBe(declared.color);
    const badge = await pseudo(page, '#declined', '::after');
    expect(badge.content).toMatch(/declined/i);
  });
}

test('a decline with no reason renders broken without a rule running', async ({ page }) => {
  await page.goto(FIXTURE);
  const badge = await pseudo(page, '#noreason', '::after');
  expect(badge.content).toMatch(/NO REASON/i);
});

test('a state with no name renders broken', async ({ page }) => {
  await page.goto(FIXTURE);
  const label = await pseudo(page, '#noname', '::before');
  expect(label.content).toMatch(/MISSING NAME/i);
});

test('a transition names both ends and what carries it', async ({ page }) => {
  await page.goto(FIXTURE);
  const t = await pseudo(page, '#t1', '::before');
  expect(t.content).toContain('resting');
  expect(t.content).toContain('hover');
  expect(t.content).toContain('pointer enters');
});

for (const width of [390, 1440]) {
  test(`the state list stays inside the page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(FIXTURE);
    const overspill = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overspill).toBeLessThanOrEqual(1);
  });
}
