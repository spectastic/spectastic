import { expect, test } from '@playwright/test';

/**
 * The materialised visual view (099-visual-embedded-view, NFR-001).
 *
 * Computed content and geometry, never presence. Two stylesheet changes this
 * week both carried cascade collisions that every structural assertion passed
 * through, and both were caught only here.
 */

const FIXTURE = '/tests/fixtures/visual-view.html';
const THEMES = ['spectastic-calm', 'spectastic-vivid'] as const;

const setTheme = (page: import('@playwright/test').Page, theme: string) =>
  page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

for (const theme of THEMES) {
  test(`the view is a visible seam inside the declaration, not a second card · ${theme}`, async ({ page }) => {
    await page.goto(FIXTURE);
    await setTheme(page, theme);
    const style = await page.locator('#v spec-visual-view').evaluate((el) => {
      const s = getComputedStyle(el);
      return { display: s.display, borderTopWidth: s.borderTopWidth, borderTopStyle: s.borderTopStyle };
    });
    expect(style.display).toBe('block');
    expect(Number.parseFloat(style.borderTopWidth)).toBeGreaterThan(0);
    expect(style.borderTopStyle).toBe('dashed');
  });

  test(`it says it is generated, so nobody edits the derived half · ${theme}`, async ({ page }) => {
    await page.goto(FIXTURE);
    await setTheme(page, theme);
    const label = await page
      .locator('#v spec-visual-view')
      .evaluate((el) => getComputedStyle(el, '::before').content ?? '');
    expect(label).toMatch(/generated/i);
    expect(label).toContain('2');
  });
}

test('a truncated projection says so rather than looking complete', async ({ page }) => {
  await page.goto(FIXTURE);
  const label = await page
    .locator('#v-trunc spec-visual-view')
    .evaluate((el) => getComputedStyle(el, '::before').content ?? '');
  expect(label).toMatch(/truncated/i);
});

test('the authored prose stays legible beside the generated part', async ({ page }) => {
  await page.goto(FIXTURE);
  await expect(page.locator('#v > p').first()).toBeVisible();
  const text = await page.locator('#v > p').first().innerText();
  expect(text).toContain('Authored reasoning');
});

for (const width of [390, 1440]) {
  test(`the projected tables stay inside the card at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(FIXTURE);
    // Presence is not containment: a table that renders and overspills its card
    // passes every "it rendered" check.
    const overspill = await page.locator('#v').evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overspill).toBeLessThanOrEqual(1);
    const pageScroll = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(pageScroll).toBeLessThanOrEqual(1);
  });
}

test('a render is bounded and sits inside the viewport', async ({ page }) => {
  await page.goto(FIXTURE);
  const img = page.locator('#v spec-visual-view figure img');
  await expect(img).toBeVisible();
  const box = await img.boundingBox();
  const vw = page.viewportSize()?.width ?? 1280;
  expect(box).not.toBeNull();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(vw + 1);
});
