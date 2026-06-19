import { test, expect } from '@playwright/test';

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
  page.locator(sel).first().evaluate((el, p) => getComputedStyle(el)[p as any], p);

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
      const measure =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--measure')) * 16;
      const widths = (sels: string[]) =>
        sels.map((s) => ({ s, w: W(s) })).filter((x) => x.w != null) as { s: string; w: number }[];
      const main = document.querySelector('main')!.getBoundingClientRect();
      return {
        measure,
        content: widths([
          'spec-tldr', 'spec-requirement', 'spec-decision', 'spec-note', 'spec-meta',
          'spec-conformance', 'spec-audience-map', 'dl.invest', 'spec-budget', 'spec-out-of-scope',
          'table', 'spec-matrix', 'spec-diff', 'pre',
        ]),
        leftMargin: Math.round(main.left),
        rightMargin: Math.round(window.innerWidth - main.right),
      };
    });
    for (const c of r.content) expect(c.w, `${c.s} caps at the reading measure`).toBeLessThanOrEqual(r.measure + 2);
    expect(Math.abs(r.leftMargin - r.rightMargin), 'main is centred (equal margins)').toBeLessThanOrEqual(2);
  });
});
