import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// T-600 / FR-009 — the vivid sticky, backdrop-blurred top header.
// Written test-first: these FAIL until the header lands (spec.js injection T-610
// + vivid CSS T-611). Contract (selectors the impl must satisfy):
//   header.spec-bar               the injected chrome bar (distinct from main's
//                                 content <header>), at the start of <body>
//   .spec-bar a[href$=index.html] brand / back-link
//   .spec-bar .spec-path          the artifact's path/name
//   .spec-bar select.theme-select theme dropdown
//   .spec-bar [data-theme-toggle] sun/moon mode toggle
const FIXTURE = '/tests/fixtures/all-components.html';
const BAR = 'header.spec-bar';

const setTheme = (page, theme: string, mode = 'light') =>
  page.evaluate(
    ({ t, m }) => {
      document.documentElement.setAttribute('data-theme', t);
      document.documentElement.setAttribute('data-mode', m);
    },
    { t: theme, m: mode }
  );

test.describe('FR-009 · header (both themes)', () => {
  test('both themes show a sticky top header at body start; calm flat, vivid blurred', async ({ page }) => {
    await page.goto(FIXTURE);
    const bar = page.locator(BAR);
    for (const theme of ['spectastic-calm', 'spectastic-vivid']) {
      await setTheme(page, theme);
      await expect(bar, theme).toBeVisible();
      expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
      // first thing in the body (source order = reading order, P-1)
      expect(await bar.evaluate((el) => el.parentElement?.tagName)).toBe('BODY');
    }
    // distinct registers: calm is flat (no blur), vivid is backdrop-blurred.
    await setTheme(page, 'spectastic-calm');
    expect(await bar.evaluate((el) => getComputedStyle(el).backdropFilter)).toBe('none');
    await setTheme(page, 'spectastic-vivid');
    expect(await bar.evaluate((el) => getComputedStyle(el).backdropFilter)).toContain('blur');
  });

  for (const theme of ['spectastic-calm', 'spectastic-vivid']) {
    test(`the header carries brand→index.html, path, theme dropdown, and mode toggle · ${theme}`, async ({ page }) => {
      await page.goto(FIXTURE);
      await setTheme(page, theme);
      await expect(page.locator(`${BAR} a[href$="index.html"]`)).toBeVisible();
      await expect(page.locator(`${BAR} .spec-path`)).toBeVisible();
      await expect(page.locator(`${BAR} select.theme-select`)).toBeVisible();
      await expect(page.locator(`${BAR} [data-theme-toggle]`)).toBeVisible();
      // controls live only in the header — the footer switcher is gone/hidden.
      await expect(page.locator('footer [data-theme-toggle]')).toBeHidden();
    });
  }

  test('header controls drive theme and mode', async ({ page }) => {
    await page.goto(FIXTURE);
    await setTheme(page, 'spectastic-vivid');
    await page.locator(`${BAR} [data-theme-toggle]`).click();
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
    await page.locator(`${BAR} select.theme-select`).selectOption('spectastic-calm');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'spectastic-calm');
  });

  // T-1005 — calm's flat #f6f5f1 backdrop is a different contrast case than vivid's
  // blurred bar, so AA is verified for both themes (NFR-003).
  for (const theme of ['spectastic-calm', 'spectastic-vivid']) {
    for (const mode of ['light', 'dark']) {
      test(`header holds AA contrast · ${theme} · ${mode}`, async ({ page }) => {
        await page.goto(FIXTURE);
        await setTheme(page, theme, mode);
        await page.waitForTimeout(450); // settle the cross-fade + blur
        const results = await new AxeBuilder({ page })
          .include(BAR)
          .withRules(['color-contrast'])
          .analyze();
        const offenders = results.violations.flatMap((v) => v.nodes.map((n) => `${n.target}`));
        expect(offenders, `${theme} header contrast failures:\n${offenders.join('\n')}`).toEqual([]);
      });
    }
  }
});

// NFR-002 — with JavaScript disabled the header never appears (it is JS-built);
// the page still renders in the default calm theme.
test.describe('FR-009 · no-JS fallback', () => {
  test.use({ javaScriptEnabled: false });
  test('no header without JS; page renders in calm', async ({ page }) => {
    await page.goto(FIXTURE);
    await expect(page.locator(BAR)).toHaveCount(0);
    await expect(page.locator('main h1')).toBeVisible();
  });
});
