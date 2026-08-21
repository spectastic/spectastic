import { expect, test } from '@playwright/test';

/**
 * 109-prose-theme US1 — the reading shell (FR-003, FR-004, FR-005, FR-009).
 *
 * Two vehicles, deliberately. The component fixture carries every card and pill
 * but no <spec-sidenote> and only four sections, so the sidenote fold and the
 * section divider are asserted against a REAL artifact instead — this spec's
 * own, which has both. Mutating the shared fixture to suit one theme would
 * change the ground every other theme test stands on.
 */
const FIXTURE = '/tests/fixtures/all-components.html';
const ARTIFACT = '/specs/109-prose-theme/spec.html';

const PROSE = 'spectastic-prose';

async function useProse(page, url: string) {
  await page.goto(url);
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.setAttribute('data-mode', 'light');
  }, PROSE);
}

// `main p` first-matches the small-caps metadata line in the header, which is
// correctly small — these assertions are about RUNNING body prose, so they target
// a paragraph inside a numbered section.
const BODY_PROSE = '#context p';

test.describe('FR-003 · the reading measure and type', () => {
  test('body type is at least 20px with leading of at least 1.6', async ({ page }) => {
    await useProse(page, ARTIFACT);
    const m = await page
      .locator(BODY_PROSE)
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return { size: parseFloat(cs.fontSize), leading: parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) };
      });
    expect(m.size, 'body font-size').toBeGreaterThanOrEqual(20);
    expect(m.leading, 'line-height ratio').toBeGreaterThanOrEqual(1.6);
  });

  test('a line of body text runs 65–75 characters', async ({ page }) => {
    await useProse(page, ARTIFACT);
    const ch = await page
      .locator(BODY_PROSE)
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        // Width of one "0" at this element's exact font — the ch unit.
        const probe = document.createElement('span');
        probe.textContent = '0';
        probe.style.cssText = `position:absolute;visibility:hidden;font:${cs.font}`;
        el.appendChild(probe);
        const one = probe.getBoundingClientRect().width;
        probe.remove();
        return parseFloat(cs.maxWidth) / one;
      });
    expect(ch).toBeGreaterThanOrEqual(65);
    expect(ch).toBeLessThanOrEqual(75);
  });

  test('the measure is unified — prose and wide content share one column (D-006)', async ({ page }) => {
    await useProse(page, ARTIFACT);
    const t = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        measure: cs.getPropertyValue('--measure').trim(),
        wide: cs.getPropertyValue('--measure-wide').trim(),
      };
    });
    expect(t.measure).toBe(t.wide);
  });
});

test.describe('FR-004 · sidenotes fold into the column', () => {
  test('a sidenote does not float at full width', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await useProse(page, ARTIFACT);
    const s = await page
      .locator('spec-sidenote')
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return { float: cs.float, display: cs.display, marginRight: cs.marginRight };
      });
    expect(s.float, 'sidenote must not float into a gutter').toBe('none');
    expect(s.display).toBe('block');
    // Calm pulls it into the margin with a negative margin; Prose must not.
    expect(parseFloat(s.marginRight)).toBeGreaterThanOrEqual(0);
  });
});

test.describe('FR-005 · component chrome is quieted, structure is not', () => {
  test('a requirement card loses its border but keeps its id and its rows', async ({ page }) => {
    await useProse(page, FIXTURE);
    const card = page.locator('spec-requirement').first();
    const border = await card.evaluate((el) => getComputedStyle(el).borderTopWidth);
    expect(parseFloat(border), 'card border').toBe(0);

    // Structure survives: the id chip still renders.
    const chip = await card.evaluate((el) => getComputedStyle(el, '::before').content);
    expect(chip).toContain('FR-');
  });

  test('a table keeps its rows and columns', async ({ page }) => {
    await useProse(page, FIXTURE);
    const rows = await page.locator('table tr').count();
    expect(rows).toBeGreaterThan(1);
    const display = await page
      .locator('table')
      .first()
      .evaluate((el) => getComputedStyle(el).display);
    expect(display).toMatch(/table/);
  });
});

test.describe('FR-009 · the section divider', () => {
  test('renders between adjacent sections and never before the first', async ({ page }) => {
    await useProse(page, ARTIFACT);
    const d = await page.evaluate(() => {
      const secs = [...document.querySelectorAll('main > section')];
      const has = (el: Element) => {
        const c = getComputedStyle(el, '::before').content;
        return c !== 'none' && c !== 'normal' && c !== '""';
      };
      return { total: secs.length, withDivider: secs.filter(has).length, firstHasOne: has(secs[0]) };
    });
    expect(d.total).toBeGreaterThan(1);
    expect(d.firstHasOne, 'no divider above the first section').toBe(false);
    expect(d.withDivider).toBe(d.total - 1);
  });

  test('the divider is decoration, not content, to assistive technology', async ({ page }) => {
    await useProse(page, ARTIFACT);
    const alt = await page.evaluate(() => {
      const s = document.querySelectorAll('main > section')[1];
      return getComputedStyle(s, '::before').content;
    });
    // The CSS alt-text form: content "…" / "" — the empty alt is what AT reads.
    expect(alt).toMatch(/\/\s*""\s*$/);
  });
});

test.describe('NFR-004 · the theme costs no downloads', () => {
  test('Prose introduces no typeface beyond the four already loaded', async ({ page }) => {
    await useProse(page, ARTIFACT);
    const families = await page.evaluate(() => {
      const seen = new Set<string>();
      document.querySelectorAll('main *').forEach((el) => {
        // First family in the stack is the one the theme actually asks for.
        const first = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim();
        if (first) seen.add(first);
      });
      return [...seen];
    });
    // The four the design system already ships. A fifth means a new download.
    const allowed = ['Fraunces', 'Source Serif 4', 'Lato', 'IBM Plex Mono'];
    const extra = families.filter((f) => !allowed.includes(f));
    expect(extra, `unexpected typeface(s): ${extra.join(', ')}`).toEqual([]);
  });

  test('selecting Prose requests no additional files', async ({ page }) => {
    await page.goto(ARTIFACT);
    const seen: string[] = [];
    page.on('request', (r) => seen.push(r.url()));
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'spectastic-prose'));
    await page.waitForTimeout(300);
    expect(seen, 'no network request on theme switch').toEqual([]);
  });
});

test.describe('the page never scrolls sideways', () => {
  for (const width of [1280, 375]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await useProse(page, ARTIFACT);
      const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(over).toBe(false);
    });
  }
});
