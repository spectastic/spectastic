import { expect, test } from '@playwright/test';

// Spec 098-token-set-versioning — FR-005/FR-010, SC-004.
//
// The requirement that can only be checked in a browser is the wording: every
// surface displaying the change class must present it as the producer's CLAIM
// rather than as a verified property. A schema rule can check the value is one
// of three tiers; only a rendered page can show what a reader is told about it.

const TOKENS = '/examples/currency-converter/visual/tokens.html';
const SCREEN = '/examples/currency-converter/specs/001-currency-conversion/visual/converter.screen.html';
const THEMES = ['spectastic-calm', 'spectastic-vivid'];

const withPseudo = (locator) =>
  locator.evaluate((el: Element) => {
    const p = (which: string) => {
      const c = getComputedStyle(el, which).content;
      return c === 'none' || c === 'normal' ? '' : c;
    };
    return `${el.textContent ?? ''} ${p('::before')} ${p('::after')}`;
  });

test.describe('FR-005 · the change class is a claim, and reads as one', () => {
  test.use({ javaScriptEnabled: false });

  for (const theme of THEMES) {
    test(`a release says "producer claims" rather than asserting it · ${theme}`, async ({ page }) => {
      await page.goto(TOKENS);
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      const rendered = await withPseudo(page.locator('spec-release').first());
      expect(rendered).toMatch(/producer claims/i);
      // The words that would assert something no mechanism establishes.
      expect(rendered).not.toMatch(/\bverified\b|\bis non-breaking\b|\bguaranteed\b/i);
    });
  }

  test('the version, the forward binding and the external base all render', async ({ page }) => {
    await page.goto(TOKENS);
    const set = await withPseudo(page.locator('spec-token-set'));
    expect(set).toContain('2.1.0');
    expect(set).toContain('2.0.0');
    // FR-010 — the external base is recorded separately, not folded in.
    expect(set).toMatch(/@acme\/tokens@4\.2\.0/);
    expect(set).toMatch(/separately/i);
  });

  test('the bump policy is legible in this artifact, not referred to elsewhere', async ({ page }) => {
    await page.goto(TOKENS);
    const text = (await page.locator('spec-token-set').textContent()) ?? '';
    expect(text).toMatch(/MAJOR/);
    expect(text).toMatch(/MINOR/);
    expect(text).toMatch(/PATCH/);
  });
});

test.describe('SC-004 · a reader can recover what work was accepted under', () => {
  test.use({ javaScriptEnabled: false });

  test('the screen carries its own token-set version, older than the live one', async ({ page }) => {
    // The forward-only binding, demonstrated on real material: the set is at
    // 2.1.0 and this screen was accepted under 2.0.0, and stays conformant to it.
    await page.goto(SCREEN);
    const stamp = await page.locator('spec-screen#convert').getAttribute('tokens-version');
    expect(stamp).toBe('2.0.0');
  });
});

test.describe('containment', () => {
  for (const width of [390, 1440]) {
    test(`the token set stays inside its box at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(TOKENS);
      const box = await page.locator('spec-token-set').evaluate((el) => ({
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
