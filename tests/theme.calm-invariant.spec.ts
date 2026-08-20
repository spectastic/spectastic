import { expect, test } from '@playwright/test';

// R-6 guard — the vivid parity work must not regress calm. Vivid rules are
// scoped to [data-theme="spectastic-vivid"]; calm (:root default) must keep
// today's computed values. These are calm's current values; if a vivid edit
// leaks into calm, one of these flips.
const FIXTURE = '/tests/fixtures/all-components.html';

async function calm(page) {
  await page.goto(FIXTURE);
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'spectastic-calm');
    document.documentElement.setAttribute('data-mode', 'light');
  });
}
const prop = (page, sel: string, p: string) =>
  page
    .locator(sel)
    .first()
    .evaluate((el, p) => getComputedStyle(el)[p as keyof CSSStyleDeclaration], p);

test.describe('calm invariance (R-6)', () => {
  test('calm pill + card radii are unchanged', async ({ page }) => {
    await calm(page);
    expect(await prop(page, 'spec-status', 'borderTopLeftRadius'), 'status pill').toBe('999px');
    expect(await prop(page, 'spec-pill', 'borderTopLeftRadius'), 'tag pill').toBe('3.2px');
    expect(await prop(page, 'spec-tldr', 'borderTopLeftRadius'), 'tldr (square left)').toBe('0px');
    expect(await prop(page, 'spec-decision', 'borderTopLeftRadius'), 'card').toBe('6.4px');
  });

  test('calm heading weights + decision border are unchanged', async ({ page }) => {
    await calm(page);
    expect(await prop(page, 'main h1', 'fontWeight')).toBe('400');
    expect(await prop(page, 'main h2', 'fontWeight')).toBe('300');
    expect(await prop(page, 'spec-decision', 'borderTopWidth'), 'no top accent in calm').toBe('1px');
  });

  // Calm is a single narrow column centred in the viewport: every block —
  // cards AND wide data (tables, matrix, diff, code) — caps at the reading
  // measure, and main has equal left/right margins.
  test('calm is one centred narrow column — all content caps at the reading measure', async ({ page }) => {
    await calm(page);
    const r = await page.evaluate(() => {
      const W = (s: string) => {
        const e = document.querySelector(s);
        return e ? Math.round(e.getBoundingClientRect().width) : null;
      };
      const measure = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--measure')) * 16;
      const widths = (sels: string[]) =>
        sels.map((s) => ({ s, w: W(s) })).filter((x) => x.w != null) as {
          s: string;
          w: number;
        }[];
      const main = document.querySelector('main')!.getBoundingClientRect();
      return {
        measure,
        content: widths([
          'spec-tldr',
          'spec-requirement',
          'spec-decision',
          'spec-note',
          'spec-meta',
          'spec-conformance',
          'spec-audience-map',
          'dl.invest',
          'spec-budget',
          'spec-out-of-scope',
          'table',
          'spec-matrix',
          'spec-diff',
          'pre',
        ]),
        leftMargin: Math.round(main.left),
        rightMargin: Math.round(window.innerWidth - main.right),
      };
    });
    for (const c of r.content) expect(c.w, `${c.s} caps at the reading measure`).toBeLessThanOrEqual(r.measure + 2);
    expect(Math.abs(r.leftMargin - r.rightMargin), 'main is centred (equal margins)').toBeLessThanOrEqual(2);
  });
});

/**
 * NFR-003 (109-prose-theme, T-900) — adding Prose changes calm and vivid in at
 * most 0 respects.
 *
 * The hardcoded baselines above already catch a Prose rule that leaks into calm
 * by forgetting its attribute scope. What they cannot catch is the other leak:
 * the reveal module writing state — data-prose-reveal, data-revealed,
 * data-receded — and leaving it behind when the reader switches away. That would
 * make an artifact render differently in calm depending on where it had been,
 * which is exactly the "no change to other themes" clause 016 NFR-005 protects.
 */
test.describe('NFR-003 — Prose leaves the other themes untouched', () => {
  const SNAPSHOT = async (page, theme: string) => {
    await page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
      document.documentElement.setAttribute('data-mode', 'light');
    }, theme);
    // Settle the .35s theme cross-fade before reading. Reduced motion would also
    // settle it, but the reveal module deliberately stands down under reduce — and
    // this test needs the module RUNNING, since what it checks is the state it
    // leaves behind. So it waits the transition out rather than switching it off.
    await page.waitForTimeout(600);
    return page.evaluate(() =>
      [...document.querySelectorAll('spec-requirement, spec-decision, spec-status, spec-pill, table')].map((el) => {
        const cs = getComputedStyle(el);
        return [cs.borderTopWidth, cs.opacity, cs.transform, cs.boxShadow, cs.maxWidth].join('|');
      }),
    );
  };

  for (const theme of ['spectastic-calm', 'spectastic-vivid']) {
    test(`${theme} renders identically before and after a visit to Prose`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto(FIXTURE);

      const before = await SNAPSHOT(page, theme);
      // Go to Prose, scroll enough for the module to write its state, come back.
      await SNAPSHOT(page, 'spectastic-prose');
      await page.evaluate(() => window.scrollTo(0, 1200));
      await page.waitForTimeout(400);
      const after = await SNAPSHOT(page, theme);

      expect(after, 'computed styles must be identical').toEqual(before);
    });

    test(`${theme} carries none of the reveal module's state`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto(FIXTURE);
      await SNAPSHOT(page, 'spectastic-prose');
      await page.evaluate(() => window.scrollTo(0, 1200));
      await page.waitForTimeout(400);
      await SNAPSHOT(page, theme);

      const leftovers = await page.evaluate(() => ({
        root: document.documentElement.hasAttribute('data-prose-reveal'),
        revealed: document.querySelectorAll('[data-revealed]').length,
        receded: document.querySelectorAll('[data-receded]').length,
      }));
      expect(leftovers).toEqual({ root: false, revealed: 0, receded: 0 });
    });
  }
});
