import { expect, test } from '@playwright/test';

// Spec 096-visual-variant-grid — FR-003/FR-005/NFR-001.
//
// Two of this spec's requirements are RENDERING claims, not data claims: a
// declined context must read differently from a supported one, and a
// never-verified baseline must read as a visible gap rather than an absence.
// Neither can be established by a schema rule, because both are about what a
// person sees.

const GRID = '/examples/currency-converter/visual/variants.html';
const THEMES = ['spectastic-calm', 'spectastic-vivid'];

const withPseudo = (locator) =>
  locator.evaluate((el: Element) => {
    const p = (which: string) => {
      const c = getComputedStyle(el, which).content;
      return c === 'none' || c === 'normal' ? '' : c;
    };
    return `${el.textContent ?? ''} ${p('::before')} ${p('::after')}`;
  });

test.describe('NFR-001 · the grid reads with scripting off', () => {
  test.use({ javaScriptEnabled: false });

  for (const theme of THEMES) {
    test(`axes, contexts and baselines all render · ${theme}`, async ({ page }) => {
      await page.goto(GRID);
      const axes = page.locator('spec-axis');
      expect(await axes.count()).toBe(3);

      // Document order IS resolution order, so the rendered order is the
      // contract — not merely a presentation detail.
      const names = await axes.evaluateAll((els) => els.map((e) => e.getAttribute('name')));
      expect(names).toEqual(['mode', 'platform', 'size-class']);

      const platform = page.locator('spec-axis[name="platform"]');
      expect(await withPseudo(platform)).toContain('interaction');
    });
  }

  test('FR-003 · a declined context reads differently from a supported one', async ({ page }) => {
    await page.goto(GRID);
    const declined = page.locator('spec-context[name="tvos"]');
    const supported = page.locator('spec-context[name="ios"]');

    expect(await withPseudo(declined)).toMatch(/declined/i);

    const declinedColour = await declined.evaluate((el) => getComputedStyle(el, '::before').color);
    const supportedColour = await supported.evaluate((el) => getComputedStyle(el, '::before').color);
    expect(declinedColour).not.toBe(supportedColour);

    // And the reason travels with it — a bare flag is the failure FR-003 exists
    // to prevent, so the reason must be visible, not merely present in source.
    expect(await declined.textContent()).toMatch(/remote/i);
  });

  test('FR-005 · a never-verified baseline reads as a visible gap', async ({ page }) => {
    await page.goto(GRID);
    const never = page.locator('spec-context[name="macos"] spec-baseline');
    const verified = page.locator('spec-context[name="ios"] spec-baseline');

    expect(await withPseudo(never)).toMatch(/NEVER VERIFIED/i);
    expect(await withPseudo(verified)).toContain('iOS 26.1');

    const neverColour = await never.evaluate((el) => getComputedStyle(el, '::before').color);
    const okColour = await verified.evaluate((el) => getComputedStyle(el, '::before').color);
    expect(neverColour).not.toBe(okColour);
  });

  test('FR-006 · a recorded identical combination is visible, and absence renders nothing', async ({ page }) => {
    await page.goto(GRID);
    const same = page.locator('spec-same');
    expect(await same.count()).toBe(2);
    expect(await withPseudo(same.first())).toContain('platform=ipados');

    // The grid has 2 x 4 x 2 = 16 combinations and 2 recorded findings. Nothing
    // renders the other 14, which is the mechanism rather than an omission.
    expect(await page.locator('spec-variant-grid > *').count()).toBeLessThan(16);
  });
});

test.describe('containment', () => {
  for (const width of [390, 1440]) {
    test(`the grid stays inside its box at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(GRID);
      const box = await page.locator('spec-variant-grid').evaluate((el) => ({
        sh: el.scrollHeight,
        ch: el.clientHeight,
        sw: el.scrollWidth,
        cw: el.clientWidth,
      }));
      expect(box.sh).toBeLessThanOrEqual(box.ch + 1);
      expect(box.sw).toBeLessThanOrEqual(box.cw + 1);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
