import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
// Import the built engine directly — the repo root isn't a workspace member.
// Requires `pnpm --filter @spectastic/core build`.
import { readBundle, renderVerifyHtml } from '../packages/core/dist/commands/verify.js';

/**
 * Behavioural guard for verify.html (spec 021-verify-view). Browser-level per
 * P-7 / CLAUDE.md: structural string checks can't prove the trace links resolve,
 * the Run block renders, an empty field renders loudly, or JS-off stays intact.
 *
 * US1 (T-100): the Run/Demo block. US2 (T-200): the trace + JS-off.
 */

const here = dirname(fileURLToPath(import.meta.url));
const fix = join(here, '..', 'packages', 'core', 'src', 'commands', '__fixtures__', 'verify');
const FILE = join(here, 'fixtures', 'verify-view.generated.html');
const URL = '/tests/fixtures/verify-view.generated.html';

const captured = {
  run: 'pnpm --filter @spectastic/core build',
  // toggle deliberately omitted → must render loudly
  tests: 'pnpm vitest run verify',
  testsCite: ['T-100', 'T-101'],
  demo: 'spectastic verify 999-fixture, then open verify.html',
  demoCite: ['SC-001'],
};

test.beforeAll(() => {
  const model = readBundle(
    readFileSync(join(fix, 'spec.html'), 'utf8'),
    readFileSync(join(fix, 'tasks.html'), 'utf8'),
    '999-fixture',
  );
  mkdirSync(join(here, 'fixtures'), { recursive: true });
  writeFileSync(FILE, renderVerifyHtml(model, captured));
});

test('US1 · the Run/Demo block shows the captured commands', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('spec-run')).toContainText('pnpm --filter @spectastic/core build');
  await expect(page.locator('spec-tests')).toContainText('pnpm vitest run verify');
  await expect(page.locator('spec-demo')).toContainText('open verify.html');
});

test('US1 · an unrecorded field renders LOUDLY, not blank (FR-009)', async ({ page }) => {
  await page.goto(URL);
  const after = await page.locator('spec-toggle').evaluate(
    (el) => getComputedStyle(el, '::after').content,
  );
  expect(after).toContain('not recorded');
});

test('US1 · the run command is selectable text a reviewer can copy (SC-003)', async ({ page }) => {
  await page.goto(URL);
  // The visible text equals the captured command verbatim — copy-paste reproduces it.
  const runText = (await page.locator('spec-run').textContent())?.trim();
  expect(runText).toBe('pnpm --filter @spectastic/core build');
});

test('US2 · each SC links to its anchor, acceptance and closing test task (SC-002)', async ({ page }) => {
  await page.goto(URL);
  // The SC link resolves to the real anchor in spec.html.
  await expect(page.locator('#trace a[href="./spec.html#SC-001"]')).toHaveCount(1);
  await expect(page.locator('#trace a[href="./spec.html#US1"]')).toHaveCount(1);
  await expect(page.locator('#trace a[href="./tasks.html#T-100"]')).toHaveCount(1);
  await expect(page.locator('#trace a[href="./spec.html#SC-002"]')).toHaveCount(1);
});

test('US2 · the trace links and Run block survive with JavaScript disabled (SC-005, NFR-001)', async ({
  browser,
}) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(URL);
  await expect(page.locator('#trace a[href="./spec.html#SC-001"]')).toHaveCount(1);
  await expect(page.locator('spec-run')).toContainText('pnpm --filter @spectastic/core build');
  await ctx.close();
});
