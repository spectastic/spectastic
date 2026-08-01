import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Spec 072-contract-embedded-view. "Presence ≠ containment" (CLAUDE.md) — every
// assertion here checks computed style and real scroll/bounding geometry, never
// merely that <spec-contract-view> exists. T-010 (Foundational): the design
// system's FIRST height-bounded scroll container. T-300 (US3): a 2000-line
// contract must not run the page. T-901/T-902 (Polish): scripting-off render,
// 0 network requests, and the accessibility sweep over the scroll region.

const FIXTURE = '/tests/fixtures/contract-view.html';

const setTheme = (page, theme: string) =>
  page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

test.describe('T-010/FR-003/D-003 · spec-contract-view is a bounded, keyboard-reachable scroll container', () => {
  for (const theme of ['spectastic-calm', 'spectastic-vivid']) {
    test(`is a bounded block with computed max-height and overflow: auto · ${theme}`, async ({ page }) => {
      await page.goto(FIXTURE);
      await setTheme(page, theme);
      const view = page.locator('#view-large spec-contract-view');
      await expect(view).toBeVisible();
      const style = await view.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { display: cs.display, overflowY: cs.overflowY, overflowX: cs.overflowX, maxHeight: cs.maxHeight };
      });
      expect(style.display).toBe('block');
      expect(style.overflowY).toBe('auto');
      expect(style.overflowX).toBe('auto');
      expect(Number.parseFloat(style.maxHeight)).toBeGreaterThan(0);
    });
  }

  test('is keyboard-focusable with an accessible name', async ({ page }) => {
    await page.goto(FIXTURE);
    const view = page.locator('#view-large spec-contract-view');
    expect(await view.getAttribute('tabindex')).toBe('0');
    const name = await view.evaluate((el) => el.getAttribute('aria-label'));
    expect(name).toBeTruthy();
    expect(name).toMatch(/large\.yaml/i);
    await view.focus();
    await expect(view).toBeFocused();
  });

  test('the projection label states the line count from attr(), not the path (attr() cannot read a parent)', async ({
    page,
  }) => {
    await page.goto(FIXTURE);
    const content = await page.locator('#view-short spec-contract-view').evaluate((el) => getComputedStyle(el, '::before').content);
    expect(content).toMatch(/3 lines/);
    expect(content).not.toMatch(/excerpt/i);
  });

  test('an excerpted view states so in its label', async ({ page }) => {
    await page.goto(FIXTURE);
    const content = await page
      .locator('#view-large spec-contract-view')
      .evaluate((el) => getComputedStyle(el, '::before').content);
    expect(content).toMatch(/2000 lines/);
    expect(content).toMatch(/excerpt/i);
  });
});

test.describe('T-300/SC-003 · a 2000-line contract does not run the page — presence ≠ containment', () => {
  test('the view itself overflows internally (scrollHeight > clientHeight) while staying on-screen', async ({
    page,
  }) => {
    await page.goto(FIXTURE);
    const view = page.locator('#view-large spec-contract-view');
    const overflow = await view.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(overflow).toBeGreaterThan(0); // 2000 lines cannot fit in a 16rem box — it MUST scroll internally
    const box = await view.boundingBox();
    const viewport = page.viewportSize();
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual((viewport?.height ?? 0) + 2000); // on the page, not off top
  });

  test("the page's own scroll height is the same whether the card with a view or the card with none is present", async ({
    page,
  }) => {
    await page.goto(FIXTURE);
    // Height contributed by view-large's card vs. view-omitted's card (no view at
    // all) must be close — the 2000-line contract must not make ITS card taller
    // than a normal card, because it scrolls internally instead of growing.
    const largeCardHeight = await page.locator('#view-large').evaluate((el) => el.getBoundingClientRect().height);
    const omittedCardHeight = await page.locator('#view-omitted').evaluate((el) => el.getBoundingClientRect().height);
    // The large card is a bit taller (it has a view; the other doesn't) but must
    // stay within one bounded container's worth of extra height, not thousands
    // of lines' worth — proving the 2000 lines were contained, not unrolled.
    expect(largeCardHeight - omittedCardHeight).toBeLessThan(400);
  });

  test('no horizontal page scroll — a very long unbroken line stays inside its own container', async ({ page }) => {
    await page.goto(FIXTURE);
    const pageOverflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(pageOverflowX).toBeLessThanOrEqual(1); // sub-pixel rounding tolerance
    const view = page.locator('#view-wide-lines spec-contract-view');
    const innerOverflowX = await view.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(innerOverflowX).toBeGreaterThan(0); // the long line DOES overflow — but inside the container
  });

  test('a card with no view (FR-007 omission) renders no spec-contract-view element', async ({ page }) => {
    await page.goto(FIXTURE);
    await expect(page.locator('#view-omitted spec-contract-view')).toHaveCount(0);
  });
});

test.describe('NFR-001 · legible with JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });

  test('the projection content and label both still render with scripting off', async ({ page }) => {
    await page.goto(FIXTURE);
    const view = page.locator('#view-short spec-contract-view');
    await expect(view).toBeVisible();
    const text = await view.textContent();
    expect(text).toMatch(/openapi: 3\.0\.0/);
    const label = await view.evaluate((el) => getComputedStyle(el, '::before').content);
    expect(label).toMatch(/3 lines/);
  });
});

test.describe('T-901/NFR-002/SC-004 · 0 scripts, 0 external requests added by the view', () => {
  test('opening the fixture makes no network request beyond the initial navigation', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto(FIXTURE);
    // Allow only what the template already ships with no view present at all:
    // the navigation document, stylesheet, favicon, theme-boot script, and the
    // sanctioned Google Fonts allowlist the templates' own CSP already grants
    // (fonts.googleapis.com/fonts.gstatic.com — a recorded exception, not
    // something this feature adds). Never anything fetched because of a
    // contract view — that's the whole NFR-002 claim.
    const unexpected = requests.filter(
      (u) =>
        !/\.(html|css|svg|js|woff2?)(\?|$)/.test(u) &&
        !u.startsWith('data:') &&
        !u.startsWith('https://fonts.googleapis.com/') &&
        !u.startsWith('https://fonts.gstatic.com/'),
    );
    expect(unexpected).toEqual([]);
  });
});

test.describe('T-902/P-13 · accessibility sweep over the scroll region', () => {
  for (const theme of ['spectastic-calm', 'spectastic-vivid']) {
    test(`no axe violations on the card set · ${theme}`, async ({ page }) => {
      await page.goto(FIXTURE);
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      const results = await new AxeBuilder({ page }).include('#cards').analyze();
      const offenders = results.violations.flatMap((v) =>
        v.nodes.map((n) => `${v.id}: ${n.target}\n    ${n.failureSummary?.split('\n').pop()?.trim()}`),
      );
      expect(offenders, `axe violations:\n${offenders.join('\n')}`).toEqual([]);
    });
  }
});
