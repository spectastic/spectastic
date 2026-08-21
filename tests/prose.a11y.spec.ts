import { expect, test } from '@playwright/test';

/**
 * 109-prose-theme — the accessibility floor (NFR-001, SC-005).
 *
 * The assertion is on the OBSERVABLE, not the property: what matters is the
 * contrast a reader actually perceives, so these composite any opacity the
 * theme applies against the surface behind it and measure the resulting ratio.
 * Asserting "opacity is 0.75" would pass just as happily on a token retune that
 * broke the floor, which is the failure this is written to catch.
 *
 * Light mode binds, not dark: measured over the real tokens, light reads
 * 4.62:1 at α=0.70 while dark reads 5.26:1, so a regression surfaces in light
 * first (design D-004).
 */
const ARTIFACT = '/specs/109-prose-theme/spec.html';
const AA_BODY = 4.5;

async function prose(page, mode: 'light' | 'dark') {
  // Explicit, not inherited. playwright.config.ts sets reducedMotion:'reduce' so
  // colour assertions read the settled state, but it does NOT reach the page —
  // matchMedia reports false and the .35s cross-fade stays live, so a mode flip
  // read immediately returns mid-transition colour. Emulating here makes it
  // instant and deterministic. (Flagged for triage: config-level tests that flip
  // mode after load are racing that transition today.)
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(ARTIFACT);
  await page.evaluate((m) => {
    document.documentElement.setAttribute('data-theme', 'spectastic-prose');
    document.documentElement.setAttribute('data-mode', m);
  }, mode);
}

/** Contrast of an element's rendered text against the nearest painted backdrop. */
const ratioOf = (selector: string) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  const parse = (c) => c.match(/[\\d.]+/g).slice(0, 3).map(Number);
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  // Walk up for the first non-transparent background — the surface actually painted.
  let node = el, bg = null;
  while (node && !bg) {
    const c = getComputedStyle(node).backgroundColor;
    if (c && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(c)) bg = parse(c);
    node = node.parentElement;
  }
  bg = bg || [255, 255, 255];
  const cs = getComputedStyle(el);
  const fg = parse(cs.color);
  // Composite every opacity between this element and the painted surface.
  let a = 1, p = el;
  while (p && p !== document.documentElement) { a *= parseFloat(getComputedStyle(p).opacity); p = p.parentElement; }
  const eff = fg.map((v, i) => a * v + (1 - a) * bg[i]);
  const [hi, lo] = [lum(eff), lum(bg)].sort((x, y) => y - x);
  return { ratio: (hi + 0.05) / (lo + 0.05), alpha: a };
})()`;

for (const mode of ['light', 'dark'] as const) {
  test.describe(`NFR-001 · body text clears AA in ${mode} mode`, () => {
    test("running prose meets 4.5:1 with the theme's emphasis applied", async ({ page }) => {
      await prose(page, mode);
      const r = await page.evaluate(ratioOf('#context p'));
      expect(r.ratio, `body contrast in ${mode}`).toBeGreaterThanOrEqual(AA_BODY);
    });

    test('no text-bearing element is recessed below the 0.70 floor (D-004)', async ({ page }) => {
      await prose(page, mode);
      const worst = await page.evaluate(() => {
        let min = 1;
        for (const el of document.querySelectorAll(
          'main section p, main section li, main section dd, main section td',
        )) {
          let a = 1,
            p: Element | null = el;
          while (p && p !== document.documentElement) {
            a *= parseFloat(getComputedStyle(p).opacity);
            p = p.parentElement;
          }
          if (el.textContent?.trim()) min = Math.min(min, a);
        }
        return min;
      });
      expect(worst, 'lowest effective opacity on text').toBeGreaterThanOrEqual(0.7);
    });
  });
}

test.describe('NFR-001 · the theme actually recesses something', () => {
  test('Prose applies an emphasis layer calm does not', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(ARTIFACT);
    const read = (theme: string) =>
      page.evaluate((t) => {
        document.documentElement.setAttribute('data-theme', t);
        document.documentElement.setAttribute('data-mode', 'light');
        const el = document.querySelector('#context p')!;
        let a = 1,
          p: Element | null = el;
        while (p && p !== document.documentElement) {
          a *= parseFloat(getComputedStyle(p).opacity);
          p = p.parentElement;
        }
        return a;
      }, theme);
    const calm = await read('spectastic-calm');
    const prosed = await read('spectastic-prose');
    expect(calm, 'calm leaves body text unrecessed').toBe(1);
    expect(prosed, 'Prose recesses body text').toBeLessThan(calm);
  });
});

/**
 * US3 — keyboard reach of the receding header (FR-008, SC-003).
 *
 * FR-008 states the recede at should-tier and the return triggers at must, and
 * this is why: a header that comes back only on hover is unreachable without a
 * mouse. So the assertion is not "the recede works" but "no control is reachable
 * by pointer and not by keyboard" — the exclusion, not the effect.
 */
for (const mode of ['light', 'dark'] as const) {
  test.describe(`FR-008 · every header control is reachable by keyboard in ${mode} mode`, () => {
    test('tabbing from the top of the document reaches each control', async ({ page }) => {
      await prose(page, mode);
      await page.evaluate(() => window.scrollTo(0, 1600));
      await page.waitForTimeout(400);

      const controls = await page.evaluate(
        () => document.querySelectorAll('header.spec-bar a, header.spec-bar button, header.spec-bar select').length,
      );
      expect(controls, 'header carries controls at all').toBeGreaterThan(0);

      const reached = new Set<string>();
      for (let i = 0; i < 12 && reached.size < controls; i++) {
        await page.keyboard.press('Tab');
        const hit = await page.evaluate(() => {
          const a = document.activeElement;
          if (!a || !a.closest('header.spec-bar')) return null;
          return a.tagName + ':' + (a.getAttribute('aria-label') || a.className || a.textContent?.trim().slice(0, 12));
        });
        if (hit) reached.add(hit);
      }
      expect(reached.size, 'every header control reached by Tab').toBe(controls);
    });

    test('focus inside the header returns it to full strength', async ({ page }) => {
      await prose(page, mode);
      await page.evaluate(() => window.scrollTo(0, 1600));
      await page.waitForTimeout(400);
      await page.evaluate(() => {
        const c = document.querySelector<HTMLElement>(
          'header.spec-bar a, header.spec-bar button, header.spec-bar select',
        );
        c?.focus();
      });
      await page.waitForTimeout(300);
      const onScreen = await page.evaluate(
        () => document.querySelector('header.spec-bar')!.getBoundingClientRect().bottom > 0,
      );
      expect(onScreen, 'keyboard focus must bring the header back on screen').toBe(true);
    });
  });
}
