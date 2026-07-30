import { expect, test } from '@playwright/test';

// T-017 (budget-bands fold) — R-2 mitigation for REQ-FORMAT-004.
// The <spec-budget> Words row MUST count *authored* prose only: the auto-built
// <spec-conformance> index is generated, not written, so it must not count
// against the author. read-time, by contrast, deliberately keeps the whole-doc
// count. This drives the real assets/spec.js and asserts the behaviour — a
// presence-only check could not tell the exclusion happened (verification
// discipline: run the JS, assert behaviour).
const FIXTURE = '/tests/fixtures/budget-authored-words.html';

test('Words row excludes the auto-built conformance index', async ({ page }) => {
  await page.goto(FIXTURE);

  // The gauge renders synchronously, but wait for the first row to be sure.
  await page.locator('spec-budget .row .value').first().waitFor();

  const m = await page.evaluate(() => {
    const words = (s: string) => {
      const t = s.trim();
      return t ? t.split(/\s+/).length : 0;
    };
    // The authored count the gauge actually rendered (Words is the first row).
    const valueText = document.querySelector('spec-budget .row .value')?.textContent ?? '';
    const rendered = Number.parseInt(valueText.split('/')[0].replace(/[^\d]/g, ''), 10);

    // Measure the document the way spec.js did, by removing the *generated*
    // subtrees from the live DOM (the disposable test page). spec.js computes
    // its word count before the gauge renders, so the gauge's own output must
    // not be in the comparison — remove <spec-budget>. Then removing
    // <spec-conformance> isolates the index's contribution.
    document.querySelectorAll('spec-budget').forEach((e) => {
      e.remove();
    });
    const withIndex = words(document.body.innerText); // authored prose + the index
    document.querySelectorAll('spec-conformance').forEach((e) => {
      e.remove();
    });
    const authored = words(document.body.innerText); // authored prose only
    return {
      rendered,
      withIndex,
      authored,
      conformanceWc: withIndex - authored,
    };
  });

  // The fixture's conformance index is populated, so the exclusion is observable.
  expect(m.conformanceWc, 'fixture must build a non-empty conformance index').toBeGreaterThan(0);
  // The gauge counted authored prose only — equal to the document with the
  // generated index removed, and strictly below the count that includes it (R-2).
  expect(m.rendered).toBe(m.authored);
  expect(m.rendered, 'authored words must be below the count that includes the index').toBeLessThan(m.withIndex);
});
