import { expect, test } from '@playwright/test';

/**
 * Spec 020 T-011. A cross-artifact link clicked inside an artifact webview must
 * post an `openLink` message to the host (so the host opens the target artifact
 * and scrolls to the anchor) instead of navigating the webview to an escaping
 * vscode-resource URL. The host-side marking + interceptor injection is
 * unit-covered in open-artifact.test.ts; here we exercise the injected JS: the
 * click → message contract and the on-load anchor scroll.
 */
const HARNESS = '/tests/vscode/fixtures/link-harness.html';

test('clicking a marked cross-artifact link posts openLink (not a navigation)', async ({ page }) => {
  await page.goto(HARNESS);
  await page.locator('#link').click();
  const posted = await page.evaluate(() => window.__posted);
  expect(posted).toContainEqual({
    type: 'openLink',
    link: '../001-x/spec.html',
    anchor: 'SC-002',
  });
  // The webview did not navigate away (still the harness, no vscode-resource URL).
  expect(page.url()).toContain('link-harness.html');
});

test('a baked data-scroll-to anchor scrolls to the target on load', async ({ page }) => {
  await page.goto(HARNESS);
  await page.waitForFunction(() => window.scrollY > 100);
  const scrolled = await page.evaluate(() => window.scrollY);
  expect(scrolled).toBeGreaterThan(100);
});
