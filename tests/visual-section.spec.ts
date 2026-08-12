import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Spec 093-design-visual-section — FR-005/FR-006/NFR-002. Written test-first:
// FAILS until the CSS card (T-118) lands.
//
// "Presence is not containment" (CLAUDE.md). Every assertion here reads
// computed style or real geometry. The scar this repeats is 048's, where an
// element shipped with render logic and zero CSS, passed every structural and
// headless check, and was only caught by a human opening it: a card that
// renders as unlabelled plain text satisfies "it exists" perfectly.

const FIXTURE = '/tests/fixtures/visual-card.html';
const THEMES = ['spectastic-calm', 'spectastic-vivid'];

const setTheme = (page, theme: string) =>
  page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

test.describe('FR-005 · the declaration renders as a card, not as plain text', () => {
  for (const theme of THEMES) {
    test(`is a bordered block surface distinct from body text · ${theme}`, async ({ page }) => {
      await page.goto(FIXTURE);
      await setTheme(page, theme);
      const card = page.locator('#v-screens');
      await expect(card).toBeVisible();
      const style = await card.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          display: cs.display,
          borderTopWidth: cs.borderTopWidth,
          background: cs.backgroundColor,
          padding: cs.paddingTop,
        };
      });
      expect(style.display).toBe('block');
      expect(Number.parseFloat(style.borderTopWidth)).toBeGreaterThan(0);
      expect(Number.parseFloat(style.padding)).toBeGreaterThan(0);
      expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
    });
  }
});

test.describe('NFR-002 · every authored value is readable with scripting off', () => {
  test.use({ javaScriptEnabled: false });

  for (const theme of THEMES) {
    test(`the token path, screens path and source all render from attr() · ${theme}`, async ({ page }) => {
      await page.goto(FIXTURE);
      const text = await page.locator('#v-screens').evaluate((el) => {
        // ::before/::after content is not in textContent, so read it directly —
        // this is the whole point: the values are CSS-surfaced, not scripted.
        const parts = [el.textContent ?? ''];
        for (const pseudo of ['::before', '::after']) {
          parts.push(getComputedStyle(el, pseudo).content ?? '');
          for (const child of Array.from(el.children)) parts.push(getComputedStyle(child, pseudo).content ?? '');
        }
        return parts.join(' ');
      });
      expect(text).toContain('visual/tokens');
      expect(text).toContain('specs/001-converter/visual');
      expect(text).toMatch(/Figma/);
    });
  }

  test('an explicit none reads as a decision, not as an empty card', async ({ page }) => {
    await page.goto(FIXTURE);
    const card = page.locator('#v-none');
    await expect(card).toBeVisible();
    // getComputedStyle returns the literal string "none" for an absent
    // pseudo-element, so a naive /none/ assertion passes on an unstyled card.
    // Read the pseudo-content only when there is some, and assert the phrase.
    const label = await card.evaluate((el) => {
      const c = getComputedStyle(el, '::before').content;
      return c === 'none' || c === 'normal' ? '' : c;
    });
    expect(label).toMatch(/no visual surface/i);
  });

  test('an external token base is visibly distinguished from a local one', async ({ page }) => {
    await page.goto(FIXTURE);
    const withExternal = await page
      .locator('#v-external')
      .evaluate((el) => `${el.textContent ?? ''} ${getComputedStyle(el, '::before').content ?? ''}`);
    expect(withExternal).toContain('@acme/design-tokens');
  });
});

test.describe('containment · a card sizes to its content and never overspills', () => {
  for (const width of [390, 1440]) {
    test(`content stays inside the card at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(FIXTURE);
      for (const id of ['v-screens', 'v-external', 'v-none', 'v-long']) {
        const box = await page.locator(`#${id}`).evaluate((el) => ({
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        }));
        expect(box.scrollHeight, `${id} height at ${width}`).toBeLessThanOrEqual(box.clientHeight + 1);
        expect(box.scrollWidth, `${id} width at ${width}`).toBeLessThanOrEqual(box.clientWidth + 1);
      }
    });

    test(`the page itself does not scroll horizontally at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(FIXTURE);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('accessibility', () => {
  test('the card region has no detectable violations', async ({ page }) => {
    await page.goto(FIXTURE);
    const results = await new AxeBuilder({ page }).include('#cards').analyze();
    expect(results.violations).toEqual([]);
  });
});
