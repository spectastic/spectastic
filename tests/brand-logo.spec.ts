import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// 017-brand-logo — the canonical spectrum mark + lockup.
// T-100 (US1): written failing-first; passes once the header builds the SVG
// lockup (T-110 helper + T-111 CSS cleanup). Prong colours measured from the
// logo guide (light spectrum + dark brightened set).
const FIXTURE = '/tests/fixtures/all-components.html';
const BRAND = 'header.spec-bar .spec-brand';

const LIGHT = [
  'rgb(95, 2, 62)', 'rgb(150, 4, 98)', 'rgb(225, 98, 79)', 'rgb(224, 162, 60)',
  'rgb(63, 106, 55)', 'rgb(4, 165, 187)', 'rgb(0, 117, 143)', 'rgb(117, 88, 178)',
];
const DARK = [
  'rgb(233, 140, 182)', 'rgb(232, 90, 171)', 'rgb(240, 138, 121)', 'rgb(255, 208, 156)',
  'rgb(143, 181, 106)', 'rgb(66, 202, 221)', 'rgb(43, 176, 196)', 'rgb(178, 155, 223)',
];

const vivid = (page, mode = 'light') =>
  page.evaluate((m) => {
    document.documentElement.setAttribute('data-theme', 'spectastic-vivid');
    document.documentElement.setAttribute('data-mode', m);
  }, mode);

test.describe('017 · brand logo — header lockup', () => {
  test('the header brand is the canonical 8-prong SVG, after the wordmark, no glyph', async ({ page }) => {
    await page.goto(FIXTURE);
    await vivid(page);
    const brand = page.locator(BRAND);
    await expect(brand).toBeVisible();
    await expect(brand).toContainText('spectastic');
    expect(await brand.evaluate((el) => el.textContent || '')).not.toMatch(/[✻✳✱]/);
    const info = await brand.evaluate((el) => {
      const svg = el.querySelector('svg');
      return { paths: svg ? svg.querySelectorAll('path').length : 0, svgIsLast: el.lastElementChild === svg };
    });
    expect(info.paths, '8 prong paths').toBe(8);
    expect(info.svgIsLast, 'mark comes after the wordmark').toBe(true);
  });

  test('prong fills are the lifecycle colours in order (light)', async ({ page }) => {
    await page.goto(FIXTURE);
    await vivid(page, 'light');
    const fills = await page.locator(`${BRAND} svg path`).evaluateAll((ps) => ps.map((p) => getComputedStyle(p).fill));
    expect(fills).toEqual(LIGHT);
  });

  test('prongs swap to the brightened palette in dark', async ({ page }) => {
    await page.goto(FIXTURE);
    await vivid(page, 'dark');
    const fills = await page.locator(`${BRAND} svg path`).evaluateAll((ps) => ps.map((p) => getComputedStyle(p).fill));
    expect(fills).toEqual(DARK);
  });

  test('the lockup is cap-line aligned and the mark is ~0.52em', async ({ page }) => {
    await page.goto(FIXTURE);
    await vivid(page);
    expect(await page.locator(BRAND).evaluate((el) => getComputedStyle(el).alignItems)).toBe('flex-start');
    const ratio = await page.locator(`${BRAND} svg`).evaluate((el) => {
      const fs = parseFloat(getComputedStyle(el.parentElement as Element).fontSize);
      return el.getBoundingClientRect().width / fs;
    });
    expect(ratio, 'mark ≈ 0.52em of the wordmark').toBeGreaterThan(0.45);
    expect(ratio).toBeLessThan(0.6);
  });
});

// T-200 (US2) — favicon reuses the canonical mark, spectrum + a dark variant.
test.describe('017 · brand logo — favicon', () => {
  test('favicon.svg uses the canonical prong path, 8 prongs, spectrum + dark', () => {
    const svg = readFileSync('assets/favicon.svg', 'utf8');
    expect(svg, 'canonical prong path').toContain('M50 50 L43.5 18 Q50 10.5 56.5 18 Z');
    expect((svg.match(/<path/g) || []).length, '8 prongs').toBe(8);
    expect(svg, 'principles spectrum colour').toContain('#5f023e');
    expect(svg, 'dark variant').toMatch(/prefers-color-scheme:\s*dark/);
    expect(svg, 'principles brightened colour').toContain('#e98cb6');
  });

  test('artifacts reference the favicon', () => {
    expect(readFileSync('templates/spec.html', 'utf8')).toMatch(/<link[^>]+rel="icon"[^>]+favicon\.svg/);
  });
});

// T-300 (US3) — the landing wordmark lockup + the mono / superscript variants.
test.describe('017 · brand logo — landing & variants', () => {
  test('the landing wordmark uses the canonical lockup (inline SVG, no-JS-safe)', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html, 'lockup class').toMatch(/class="[^"]*spec-logo/);
    expect(html, 'canonical prong path').toContain('M50 50 L43.5 18 Q50 10.5 56.5 18 Z');
    const block = html.slice(html.indexOf('spec-logo'));
    expect((block.match(/<path/g) || []).length, '8 inline prongs').toBeGreaterThanOrEqual(8);
  });

  test('mono lockup is single-ink; the superscript variant renders', async ({ page }) => {
    await page.goto(FIXTURE);
    const fills = await page.locator('.spec-logo--mono svg path').evaluateAll((ps) => ps.map((p) => getComputedStyle(p).fill));
    expect(fills.length, '8 prongs').toBe(8);
    expect(new Set(fills).size, 'mono = one ink across all prongs').toBe(1);
    await expect(page.locator('sup.spec-sup svg').first()).toBeVisible();
  });
});
