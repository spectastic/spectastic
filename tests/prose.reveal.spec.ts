import { expect, test } from '@playwright/test';

/**
 * 109-prose-theme US2 — the reveal (FR-006, FR-007, NFR-002).
 *
 * The one-way latch is the whole point, and it is why this is a script rather
 * than CSS: a design-time spike measured `animation-timeline: view()` scrubbing
 * by scroll position — opacity 0 → 1 → 0 across a scroll down and back — which
 * is the fade-out this spec exists to avoid. So the assertion that matters is
 * the SECOND one: revealed, then still revealed after scrolling away.
 *
 * The resting state is authored visible (D-003), so every "with the enhancement
 * off" case below asserts the reader sees everything, not nothing.
 */
const ARTIFACT = '/specs/109-prose-theme/design.html';

async function prose(page, opts: { reduced?: boolean } = {}) {
  await page.emulateMedia({ reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
  await page.goto(ARTIFACT);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'spectastic-prose'));
}

/** Effective opacity of a block, compositing every ancestor. */
const opacityOf = (nth: number) => `(() => {
  const el = document.querySelectorAll('main > section')[${nth}];
  let a = 1, p = el;
  while (p && p !== document.documentElement) { a *= parseFloat(getComputedStyle(p).opacity); p = p.parentElement; }
  return a;
})()`;

test.describe('FR-006 · a block reveals once and stays revealed', () => {
  test('a block below the fold starts unrevealed', async ({ page }) => {
    await prose(page);
    await page.waitForTimeout(150);
    const a = await page.evaluate(opacityOf(6));
    expect(a, 'a far-down block should not be shown before it is reached').toBeLessThan(1);
  });

  test('scrolling to a block reveals it', async ({ page }) => {
    await prose(page);
    await page.evaluate(() => document.querySelectorAll('main > section')[6].scrollIntoView());
    await page.waitForTimeout(900);
    expect(await page.evaluate(opacityOf(6))).toBe(1);
  });

  test('scrolling back to the top does NOT hide it again — the one-way latch', async ({ page }) => {
    await prose(page);
    await page.evaluate(() => document.querySelectorAll('main > section')[6].scrollIntoView());
    await page.waitForTimeout(900);
    expect(await page.evaluate(opacityOf(6)), 'revealed').toBe(1);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
    expect(await page.evaluate(opacityOf(6)), 'still revealed after scrolling away').toBe(1);
  });
});

test.describe('FR-007 · the reveal is scoped to Prose', () => {
  test('calm and vivid never hide a block', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(ARTIFACT);
    for (const theme of ['spectastic-calm', 'spectastic-vivid']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(150);
      expect(await page.evaluate(opacityOf(6)), `${theme} must be untouched`).toBe(1);
    }
  });
});

test.describe('NFR-002 · nothing is ever hidden from a reader who cannot see the animation', () => {
  test('reduced motion leaves every block visible', async ({ page }) => {
    await prose(page, { reduced: true });
    await page.waitForTimeout(200);
    const worst = await page.evaluate(() => {
      let min = 1;
      document.querySelectorAll('main > section').forEach((el) => {
        let a = 1, p: Element | null = el;
        while (p && p !== document.documentElement) { a *= parseFloat(getComputedStyle(p).opacity); p = p.parentElement; }
        min = Math.min(min, a);
      });
      return min;
    });
    expect(worst, 'no block hidden under reduced motion').toBe(1);
  });

  test('with JavaScript disabled every block is visible', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(ARTIFACT);
    // No script runs, so no theme is applied and no block may be hidden by CSS:
    // the resting state is visible and the script adds the hidden state (D-003).
    const worst = await page.evaluate(() => {
      let min = 1;
      document.querySelectorAll('main > section').forEach((el) => {
        min = Math.min(min, parseFloat(getComputedStyle(el).opacity));
      });
      return min;
    });
    expect(worst, 'JS off must never mean text off').toBe(1);
    await ctx.close();
  });
});

test.describe('printing', () => {
  test('an unrevealed block is not invisible on paper', async ({ page }) => {
    await prose(page);
    await page.waitForTimeout(150);
    expect(await page.evaluate(opacityOf(6)), 'hidden on screen first').toBeLessThan(1);
    await page.emulateMedia({ media: 'print' });
    expect(await page.evaluate(opacityOf(6)), 'visible on paper').toBe(1);
  });
});

/**
 * US3 — the receding header (FR-008). Extends this file rather than opening a
 * new one because the scroll-up trigger lives in the same module as the reveal:
 * both are the remembered state CSS cannot hold.
 */
test.describe('FR-008 · the header recedes and returns', () => {
  /* The observable is whether the bar sits OVER the text, not what its opacity is.
     Receding by fading was rejected: a header held at low opacity is still a UI
     control below NFR-001's 3:1 floor, and still covers the column. Translating it
     out is both contrast-safe and literally what US3 asks for — "nothing hovers
     over the text". So this reads the rendered position. */
  const recededness = () =>
    `(() => {
      const bar = document.querySelector('header.spec-bar');
      const r = bar.getBoundingClientRect();
      return { opacity: +getComputedStyle(bar).opacity, bottom: Math.round(r.bottom),
               offScreen: r.bottom <= 0, receded: bar.hasAttribute('data-receded') };
    })()`;

  test('it recedes while reading forward', async ({ page }) => {
    await prose(page);
    expect((await page.evaluate(recededness())).receded, 'not receded at rest').toBe(false);
    await page.evaluate(() => window.scrollTo(0, 1600));
    await page.waitForTimeout(600);
    const r = await page.evaluate(recededness());
    expect(r.receded, 'receded after reading down').toBe(true);
    expect(r.offScreen, 'and is no longer over the text').toBe(true);
  });

  test('it returns on scrolling up', async ({ page }) => {
    await prose(page);
    await page.evaluate(() => window.scrollTo(0, 1600));
    await page.waitForTimeout(400);
    expect((await page.evaluate(recededness())).receded).toBe(true);

    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForTimeout(400);
    expect((await page.evaluate(recededness())).receded, 'returns on reversing direction').toBe(false);
  });

  test('it returns on pointer', async ({ page }) => {
    await prose(page);
    await page.evaluate(() => window.scrollTo(0, 1600));
    await page.waitForTimeout(400);
    expect((await page.evaluate(recededness())).receded).toBe(true);

    // A real pointer at the top edge, not locator.hover(): once receded the bar's
    // own box is entirely above the viewport, so hovering *it* is not what a reader
    // does — they move toward the top of the screen, onto the reach strip.
    await page.mouse.move(640, 4);
    await page.waitForTimeout(500);
    const r = await page.evaluate(recededness());
    expect(r.offScreen, 'pointer at the top edge brings the header back').toBe(false);
  });

  test('calm and vivid never recede the header', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(ARTIFACT);
    for (const theme of ['spectastic-calm', 'spectastic-vivid']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.evaluate(() => window.scrollTo(0, 1600));
      await page.waitForTimeout(400);
      const r = await page.evaluate(recededness());
      expect(r.receded, `${theme} header must be untouched`).toBe(false);
      expect(r.offScreen, `${theme} header stays on screen`).toBe(false);
    }
  });
});
