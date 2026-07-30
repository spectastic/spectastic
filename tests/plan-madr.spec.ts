import { expect, test } from '@playwright/test';

/**
 * Behavioural guard for the MADR Considered-Options card (spec 050-stack-selection,
 * FR-008 / SC-003). Written before the markup/CSS exists (T-301) — failing until
 * T-311 lands. Presence AND containment, per the repo's verification discipline
 * (CLAUDE.md): a card that renders is not enough if its content overflows its own
 * box or is clipped.
 */
const FIXTURE = '/tests/fixtures/all-components.html';

test('a decision with Considered Options shows >=2 options with pros/cons', async ({ page }) => {
  await page.goto(FIXTURE);
  const card = page.locator('#D-X2');
  await expect(card).toBeVisible();

  const options = card.locator('.considered-options li');
  expect(await options.count()).toBeGreaterThanOrEqual(2);

  const text = await card.locator('.considered-options').innerText();
  expect(text).toContain('+');
  expect(text).toContain('−');
});

test('decision drivers are named, distinct from the options list', async ({ page }) => {
  await page.goto(FIXTURE);
  const driversRow = page.locator('#D-X2 dt', { hasText: 'Decision drivers' });
  await expect(driversRow).toBeVisible();
});

test('the Considered Options list is contained — no overflow of its own box', async ({ page }) => {
  await page.goto(FIXTURE);
  const list = page.locator('#D-X2 .considered-options');
  const overflow = await list.evaluate((el) => el.scrollHeight - el.clientHeight);
  expect(overflow, 'content must not overflow its own box').toBeLessThanOrEqual(1);
});

test('existing Nygard-shaped decision (D-X1) is untouched — no Considered Options rendered', async ({ page }) => {
  await page.goto(FIXTURE);
  const legacy = page.locator('#D-X1 .considered-options');
  await expect(legacy).toHaveCount(0);
});

test('renders correctly in both themes', async ({ page }) => {
  await page.goto(FIXTURE);
  for (const mode of ['light', 'dark']) {
    await page.evaluate((m) => document.documentElement.setAttribute('data-mode', m), mode);
    await expect(page.locator('#D-X2')).toBeVisible();
    const bounds = await page.locator('#D-X2 .considered-options').boundingBox();
    expect(bounds, `Considered Options box must exist in ${mode} mode`).not.toBeNull();
    expect(bounds!.width, `must not collapse to zero width in ${mode} mode`).toBeGreaterThan(0);
  }
});
