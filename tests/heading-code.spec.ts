import { expect, test } from '@playwright/test';

// Regression guard for a long-standing base bug (both themes): inline <code>
// inside a heading inflated the tight heading line box and overlapped the
// adjacent wrapped line. Invariant: code must fit within the heading's line box.
const FIXTURE = '/tests/fixtures/all-components.html';

for (const theme of ['spectastic-calm', 'spectastic-vivid']) {
  test(`inline code fits the heading line box · ${theme}`, async ({ page }) => {
    await page.goto(FIXTURE);
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    const fits = await page
      .locator('main h1 code')
      .first()
      .evaluate((el) => {
        const h1 = el.closest('h1') as HTMLElement;
        const lineBox = parseFloat(getComputedStyle(h1).lineHeight);
        return el.getBoundingClientRect().height <= lineBox + 1;
      });
    expect(fits, 'heading inline code must not exceed the heading line box').toBe(true);
  });

  // The out-of-scope item must NOT be a grid/flex container: those pull inline
  // <code>/<a> from the description into the chip column (the bug). A block list
  // with an inline-block chip keeps inline content in the text flow, and the
  // auto-sized chip can't overflow into the text.
  test(`out-of-scope item keeps inline content in the text flow · ${theme}`, async ({ page }) => {
    await page.goto(FIXTURE);
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    const display = await page
      .locator('spec-out-of-scope li')
      .first()
      .evaluate((el) => getComputedStyle(el).display);
    expect(['block', 'list-item'], 'item is not grid/flex').toContain(display);
    // an inline <code> in the description sits in the text, not at the chip column
    const inText = await page
      .locator('spec-out-of-scope li code')
      .first()
      .evaluate((code) => {
        const li = code.closest('li') as HTMLElement;
        return code.getBoundingClientRect().left > li.getBoundingClientRect().left + 40;
      });
    expect(inText, 'inline code flows in the description, not the chip column').toBe(true);
  });
}
