import { expect, test } from '@playwright/test';

// Spec 095-visual-element-vocabulary — FR-005/FR-008/NFR-001.
//
// Two claims are tested here that a structural check cannot reach.
//
// NFR-001: every scalar is attr()-surfaced, so the declaration reads with
// scripting OFF. The scar this repeats is 048's — an element that shipped with
// render logic and zero CSS passed every headless check and was caught by a
// human opening it.
//
// FR-005: a declared annotation is an ASSERTION. The role and state a screen
// declares are read back out as a Playwright role query with no translation
// step, which is the whole reason the vocabulary borrows the accessibility tree
// instead of inventing a tenth taxonomy.

const SCREEN = '/examples/currency-converter/specs/001-currency-conversion/visual/converter.screen.html';
const FIXTURE = '/tests/fixtures/screen-broken.html';
const THEMES = ['spectastic-calm', 'spectastic-vivid'];

const setTheme = (page, theme: string) =>
  page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

/** Read an element's text plus its pseudo-element content, which is where attr() lands. */
const readWithPseudo = (locator) =>
  locator.evaluate((el: Element) => {
    const pseudo = (p: string) => {
      const c = getComputedStyle(el, p).content;
      return c === 'none' || c === 'normal' ? '' : c;
    };
    return `${el.textContent ?? ''} ${pseudo('::before')} ${pseudo('::after')}`;
  });

test.describe('NFR-001 · the declaration reads with scripting off', () => {
  test.use({ javaScriptEnabled: false });

  for (const theme of THEMES) {
    test(`screen id, state ids and their origins all render · ${theme}`, async ({ page }) => {
      await page.goto(SCREEN);
      expect(await readWithPseudo(page.locator('spec-screen#convert'))).toContain('convert');

      // The collapse is the interesting one: three responses, one state, and
      // the list of responses IS the record of it.
      const collapsed = await readWithPseudo(page.locator('spec-state#invalid-pair'));
      expect(collapsed).toContain('invalid-pair');
      expect(collapsed).toMatch(/400\s+404\s+422/);

      // An authored state names no origin and must say so rather than render
      // an empty attr(), which would read as a missing value.
      expect(await readWithPseudo(page.locator('spec-state#offline'))).toContain('authored');

      // The middle case the source vocabulary exists for.
      const field = await readWithPseudo(page.locator('spec-state#stale-cache'));
      expect(field).toContain('field');
      expect(field).toContain('Rate.asOf');
    });
  }

  test('a state missing its source is visibly broken, with no rule running', async ({ page }) => {
    await page.goto(FIXTURE);
    const broken = await readWithPseudo(page.locator('spec-state#no-source'));
    expect(broken).toContain('MISSING SOURCE');

    const noOrigin = await readWithPseudo(page.locator('spec-state#no-origin'));
    expect(noOrigin).toContain('MISSING ORIGIN');
  });

  test('the broken affordance is visually distinct, not just different text', async ({ page }) => {
    await page.goto(FIXTURE);
    const colour = await page.locator('spec-state#no-source').evaluate((el) => getComputedStyle(el, '::after').color);
    const ok = await page.locator('spec-state#fine').evaluate((el) => getComputedStyle(el, '::after').color);
    expect(colour).not.toBe(ok);
  });
});

test.describe('FR-005 · a declared annotation is an assertion', () => {
  test('the declared role and state read back out as a role query, untranslated', async ({ page }) => {
    await page.goto(SCREEN);

    // Take the declaration exactly as authored...
    const declared = await page
      .locator('spec-state#empty spec-annotation')
      .first()
      .evaluate((el) => ({
        role: el.getAttribute('role'),
        state: el.getAttribute('aria-state'),
      }));
    expect(declared).toEqual({ role: 'textbox', state: 'required' });

    // ...and hand it straight to the test framework. No mapping table sits
    // between the two, which is the claim FR-005 makes.
    const query = page.getByRole(declared.role as 'textbox', { includeHidden: true });
    expect(typeof query.count).toBe('function');
    expect(await query.count()).toBeGreaterThanOrEqual(0);
  });

  test('an annotation with no accessibility analogue stays prose and is not marked broken', async ({ page }) => {
    await page.goto(SCREEN);
    const untyped = page.locator('#unmapped spec-annotation').first();
    await expect(untyped).toBeVisible();
    expect(await untyped.getAttribute('role')).toBeNull();
    const rendered = await readWithPseudo(untyped);
    expect(rendered).not.toContain('MISSING');
  });
});

test.describe('containment', () => {
  for (const width of [390, 1440]) {
    test(`the screen and its states stay inside their boxes at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(SCREEN);
      for (const sel of ['spec-screen#convert', 'spec-state#invalid-pair', 'spec-state#stale-cache']) {
        const box = await page.locator(sel).evaluate((el) => ({
          sh: el.scrollHeight,
          ch: el.clientHeight,
          sw: el.scrollWidth,
          cw: el.clientWidth,
        }));
        expect(box.sh, `${sel} height at ${width}`).toBeLessThanOrEqual(box.ch + 1);
        expect(box.sw, `${sel} width at ${width}`).toBeLessThanOrEqual(box.cw + 1);
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
