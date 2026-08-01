import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Spec 069-design-contract-section — D-001/D-003/NFR-002. Written test-first
// (T-011): FAILS until the CSS card (T-014) lands. Verifies the <spec-contract>
// card renders as a bordered, block-level surface with a composed header line
// (shape · path · format), an event-driven-only [direction] badge, no
// containment overflow, in both themes, and — the NFR-002 claim — still legible
// with JavaScript disabled, since every scalar is attr()-driven CSS.

const FIXTURE = '/tests/fixtures/contract-card.html';

const setTheme = (page, theme: string) =>
  page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

function beforeContent(page, selector: string) {
  return page.locator(selector).evaluate((el) => getComputedStyle(el, '::before').content);
}

function afterContent(page, selector: string) {
  return page.locator(selector).evaluate((el) => getComputedStyle(el, '::after').content);
}

// 077-event-schema-evolution T-201: the compatibility stance is a CLAIM, not a
// verified fact, and CSS content: attr() has no notion of concatenating two
// separate ::before/::after strings for us — so we read both pseudo-elements
// and check the union, since T-212 (CSS implementation, not yet built) is free
// to land the stance text in either one (most likely combined into ::after
// alongside the existing [direction] badge per D-002).
function pseudoContent(page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    const before = getComputedStyle(el, '::before').content;
    const after = getComputedStyle(el, '::after').content;
    return `${before} ${after}`;
  });
}

test.describe('FR-002/FR-003 · <spec-contract> renders as a styled, block-level card', () => {
  for (const theme of ['spectastic-calm', 'spectastic-vivid']) {
    test(`is visible with non-zero size · ${theme}`, async ({ page }) => {
      await page.goto(FIXTURE);
      await setTheme(page, theme);
      const card = page.locator('#shape-request-response');
      await expect(card).toBeVisible();
      const box = await card.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(0);
      expect(box?.height ?? 0).toBeGreaterThan(0);
      expect(await card.evaluate((el) => getComputedStyle(el).display)).toBe('block');
    });
  }

  test('the header line composes shape, path and format for a declared interface', async ({ page }) => {
    await page.goto(FIXTURE);
    const content = await beforeContent(page, '#shape-request-response');
    expect(content).toMatch(/request-response/i);
    expect(content).toMatch(/api\/openapi\.yaml/i);
    expect(content).toMatch(/openapi/i);
  });

  test('a shape="none" card carries no path/format in its header line', async ({ page }) => {
    await page.goto(FIXTURE);
    const content = await beforeContent(page, '#shape-none');
    expect(content).toMatch(/none/i);
    expect(content).not.toMatch(/\.yaml|\.proto|\.graphql/i);
  });

  test('containment — the card does not overflow its own box or the viewport', async ({ page }) => {
    await page.goto(FIXTURE);
    for (const id of ['shape-request-response', 'shape-rpc', 'shape-graphql', 'shape-event-driven', 'shape-none']) {
      const card = page.locator(`#${id}`);
      const overflow = await card.evaluate((el) => el.scrollHeight - el.clientHeight);
      expect(overflow).toBeLessThanOrEqual(1); // sub-pixel rounding tolerance
      const box = await card.boundingBox();
      const viewportWidth = await page.evaluate(() => window.innerWidth);
      expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewportWidth);
    }
  });
});

test.describe('D-003 · [direction] badge only on the event-driven case', () => {
  test('the event-driven card carries a direction badge', async ({ page }) => {
    await page.goto(FIXTURE);
    const content = await afterContent(page, '#shape-event-driven');
    expect(content).toMatch(/publishes/i);
  });

  test('a non-event-driven card carries no direction badge', async ({ page }) => {
    await page.goto(FIXTURE);
    const content = await afterContent(page, '#shape-request-response');
    expect(content === 'none' || content === '""').toBe(true);
  });
});

test.describe('077 · compatibility stance renders on the card', () => {
  for (const theme of ['spectastic-calm', 'spectastic-vivid']) {
    test(`a card carrying compatibility="backward" compatibility-scope="all" renders a producer-claim stance line · ${theme}`, async ({
      page,
    }) => {
      await page.goto(FIXTURE);
      await setTheme(page, theme);
      const content = await pseudoContent(page, '#shape-event-driven-stance');
      // Not a verified fact — the copy must read as the producer's claim.
      expect(content).toMatch(/claims?/i);
      expect(content).toMatch(/backward/i);
      expect(content).toMatch(/all/i);
    });
  }

  test('a card with no compatibility attributes carries no compatibility-stance text', async ({ page }) => {
    await page.goto(FIXTURE);
    const content = await pseudoContent(page, '#shape-event-driven');
    expect(content).not.toMatch(/claims?/i);
    expect(content).not.toMatch(/compatib/i);
    expect(content).not.toMatch(/backward|forward|full/i);
  });
});

test.describe('NFR-002 · legible with JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });

  test('the header line still renders — the mechanism is CSS attr(), not a JS enhancement', async ({ page }) => {
    await page.goto(FIXTURE);
    const content = await beforeContent(page, '#shape-request-response');
    expect(content).toMatch(/request-response/i);
  });

  test('077 · the compatibility stance still renders with scripting off', async ({ page }) => {
    await page.goto(FIXTURE);
    const content = await pseudoContent(page, '#shape-event-driven-stance');
    expect(content).toMatch(/claims?/i);
    expect(content).toMatch(/backward/i);
  });
});

test.describe('P-13 · <spec-contract> accessibility sweep', () => {
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
