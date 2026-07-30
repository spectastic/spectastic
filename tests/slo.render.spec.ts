import { expect, test } from '@playwright/test';

// Spec 047-slo-nfr-artifact — FR-001 (render as a typed block) + the
// spec-slo[target] click-through (mirrors spec-delta[target], assets/spec.js).
// Written test-first (T-102): FAILS until the CSS card (T-113) and the JS
// click-through (T-114) land. Verifies SC-001 ("renders linked to its NFR
// with click-through") and NFR-002 (legible in both themes).

const FIXTURE = '/tests/fixtures/slo-render.html';
const SLO = 'spec-slo#the-slo';
const NFR = '#NFR-001';

const setTheme = (page, theme: string) =>
  page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

test.describe('FR-001 · <spec-slo> renders as a styled, block-level card', () => {
  for (const theme of ['spectastic-calm', 'spectastic-vivid']) {
    test(`is visible with non-zero size · ${theme}`, async ({ page }) => {
      await page.goto(FIXTURE);
      await setTheme(page, theme);
      const slo = page.locator(SLO);
      await expect(slo).toBeVisible();
      const box = await slo.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(0);
      expect(box?.height ?? 0).toBeGreaterThan(0);
      // A styled card, not an unstyled inline run of text (T-113).
      expect(await slo.evaluate((el) => getComputedStyle(el).display)).toBe('block');
    });
  }
});

test.describe('FR-001 · spec-slo[target] click-through', () => {
  test('is marked clickable with a "Jump to" title', async ({ page }) => {
    await page.goto(FIXTURE);
    const slo = page.locator(SLO);
    await slo.scrollIntoViewIfNeeded();
    expect(await slo.evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer');
    await expect(slo).toHaveAttribute('title', /Jump to NFR-001/);
  });

  test('clicking scrolls the target NFR into view', async ({ page }) => {
    await page.goto(FIXTURE);
    const nfr = page.locator(NFR);
    const slo = page.locator(SLO);

    // NFR-001 sits near the top, so a page load (scrollY=0) already shows it —
    // scroll down to the SLO first (the reader has found it, far below the
    // fold) so the NFR genuinely leaves the viewport before the click.
    await slo.scrollIntoViewIfNeeded();
    const before = await nfr.evaluate((el) => el.getBoundingClientRect().top);
    expect(before).toBeLessThan(0);

    await slo.click();
    await page.waitForTimeout(900); // settle the smooth scroll

    const after = await nfr.evaluate((el) => el.getBoundingClientRect().top);
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    // A small negative tolerance: the injected sticky theme header (spec.js
    // §7) sits at viewport top, so `scrollIntoView({block:'start'})` can land
    // a few px shy of exactly 0. The functional claim is "scrolled from ~far
    // off-screen to on-screen", not pixel-perfect alignment.
    expect(after).toBeGreaterThanOrEqual(-20);
    expect(after).toBeLessThan(viewportHeight);
  });
});
