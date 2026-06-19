import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// SC-006 — spectastic-vivid visual parity with the reference design.
// Targets are MEASURED from example.html via getComputedStyle (the Chrome
// connector), not transcribed from inline CSS and not guessed (plan R-7).
// The reference is law; any divergence is a documented decision, not a default.
// Slice 1 = shape; Slice 2 (layout) is added alongside by T-500.
const FIXTURE = '/tests/fixtures/all-components.html';

// Reference targets — computed styles read off example.html:
const REF = {
  statusRadius: '5px', // status pill ("accepted"):     border-radius 5px
  pillRadius: '4px', // tag / priority pill (must/should): border-radius 4px
  cardRadius: '12px', // tldr / requirement / decision / note cards: 12px
  ruleWidth: '1px', // every card border:               border-*-width 1px
  accentBar: '3px', // tldr gold / decision accent:     border-left|top-width 3px
  h1Weight: '500', // Fraunces display heading:         font-weight 500
  h2Weight: '540', // Fraunces section headings:        font-weight 540
};

async function vivid(page) {
  await page.goto(FIXTURE);
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'spectastic-vivid');
    document.documentElement.setAttribute('data-mode', 'light');
  });
}
const prop = (page, sel: string, p: string) =>
  page.locator(sel).first().evaluate((el, p) => getComputedStyle(el)[p as any], p);

test.describe('SC-006 · vivid parity — Slice 1 (shape)', () => {
  test('pills match the reference radii (status 5px, tag 4px)', async ({ page }) => {
    await vivid(page);
    expect(await prop(page, 'spec-status', 'borderTopLeftRadius')).toBe(REF.statusRadius);
    expect(await prop(page, 'spec-pill', 'borderTopLeftRadius')).toBe(REF.pillRadius);
  });

  test('cards match the reference radius (12px)', async ({ page }) => {
    await vivid(page);
    for (const sel of ['spec-tldr', 'spec-decision', 'spec-note']) {
      expect(await prop(page, sel, 'borderTopLeftRadius'), sel).toBe(REF.cardRadius);
    }
  });

  test('rule + accent widths match the reference (1px rules, 3px accents)', async ({ page }) => {
    await vivid(page);
    expect(await prop(page, 'spec-note', 'borderTopWidth'), 'rule width').toBe(REF.ruleWidth);
    expect(await prop(page, 'spec-tldr', 'borderLeftWidth'), 'accent bar').toBe(REF.accentBar);
  });

  test('heading weights match the reference (h1 500, h2 540)', async ({ page }) => {
    await vivid(page);
    expect(await prop(page, 'main h1', 'fontWeight')).toBe(REF.h1Weight);
    expect(await prop(page, 'main h2', 'fontWeight')).toBe(REF.h2Weight);
  });
});

test.describe('SC-006 · vivid parity — Slice 2 (layout)', () => {
  test('goals/non-goals become a two-column grid', async ({ page }) => {
    await vivid(page);
    expect(await prop(page, 'section#goals', 'display')).toBe('grid');
    expect((await prop(page, 'section#goals', 'gridTemplateColumns')).split(' ').length).toBe(2);
  });

  test('budget gauge renders as a horizontal row of cards (10px)', async ({ page }) => {
    await vivid(page);
    expect(await prop(page, 'spec-budget', 'display')).toBe('flex');
    expect(await prop(page, 'spec-budget .row', 'borderTopLeftRadius')).toBe('10px');
  });

  test('meta is an aligned multi-column grid (keys align with values)', async ({ page }) => {
    await vivid(page);
    expect(await prop(page, 'spec-meta', 'display')).toBe('grid');
    // two key/value pairs per row → 4 tracks (more compact than calm, still aligned)
    expect((await prop(page, 'spec-meta', 'gridTemplateColumns')).split(' ').length).toBe(4);
  });

  test('changelog renders as a timeline with a left rail', async ({ page }) => {
    await vivid(page);
    expect(await prop(page, 'spec-changelog ol', 'borderLeftWidth')).toBe('2px');
    expect(await prop(page, 'spec-changelog ol', 'borderLeftStyle')).toBe('solid');
  });

  test('options matrix is carded (12px)', async ({ page }) => {
    await vivid(page);
    expect(await prop(page, 'spec-matrix', 'borderTopLeftRadius')).toBe(REF.cardRadius);
  });

  test('requirements render as cards (reversed the T-002 gutter divergence)', async ({ page }) => {
    await vivid(page);
    expect(await prop(page, 'spec-requirement', 'borderTopLeftRadius')).toBe(REF.cardRadius);
    expect(await prop(page, 'spec-requirement', 'borderTopWidth')).toBe('1px');
  });

  test('prose cards align to the reading measure (do not overrun the text column)', async ({ page }) => {
    await vivid(page);
    const measurePx = await page.evaluate(
      () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--measure')) * 16
    );
    const cardW = await page
      .locator('spec-requirement')
      .first()
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(cardW, 'card width ≈ measure, not the wide container').toBeLessThanOrEqual(measurePx + 2);
  });

  test('vivid is one column — top-level blocks share width and left edge', async ({ page }) => {
    await vivid(page);
    const boxes = await page.evaluate(() => {
      const sels = ['main h1', 'spec-meta', 'spec-budget', 'spec-tldr', 'spec-requirement', 'section#x > p'];
      return sels
        .map((s) => {
          const el = document.querySelector(s);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { s, w: Math.round(r.width), l: Math.round(r.left) };
        })
        .filter(Boolean) as { s: string; w: number; l: number }[];
    });
    const ws = boxes.map((b) => b.w);
    const ls = boxes.map((b) => b.l);
    const detail = JSON.stringify(boxes);
    expect(Math.max(...ws) - Math.min(...ws), `widths differ: ${detail}`).toBeLessThanOrEqual(1);
    expect(Math.max(...ls) - Math.min(...ls), `left edges differ: ${detail}`).toBeLessThanOrEqual(1);
  });

  test('priority + status pills are filled (bright treatment)', async ({ page }) => {
    await vivid(page);
    const afterBg = await page
      .locator('spec-requirement[priority="must"]')
      .first()
      .evaluate((el) => getComputedStyle(el, '::after').backgroundColor);
    expect(afterBg, 'MUST priority pill is filled').not.toBe('rgba(0, 0, 0, 0)');
    const statusBg = await prop(page, 'spec-status', 'backgroundColor');
    expect(statusBg, 'status pill is filled').not.toBe('rgba(0, 0, 0, 0)');
  });
});

// T-904 — NFR-005: themes are CSS-only over the existing vocabulary; no document
// carries theme markup. (Node-side: reads the shipped files.)
test('NFR-005 — theme styling is attribute-scoped, no document markup', () => {
  const css = readFileSync('assets/spec.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const allowed = ['[data-theme="spectastic-vivid"]', '[data-theme="spectastic-calm"]'];
  for (const sel of css.match(/\[data-theme="[^"]*"\]/g) || []) {
    expect(allowed, `unexpected theme selector ${sel}`).toContain(sel);
  }
  // a document carries the theme only on <html> — never in its body
  const fixture = readFileSync('tests/fixtures/all-components.html', 'utf8');
  const body = fixture.slice(fixture.indexOf('<body'));
  expect(body).not.toMatch(/data-theme=/);
  expect(body).not.toMatch(/class="[^"]*spectastic-(vivid|calm)/);
});
