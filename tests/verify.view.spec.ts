import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
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
// A second fixture with NO exercise entry point — the real "a schema rule has
// nothing to exercise" case, which the primary fixture cannot show because it
// populates the field.
const FILE_NO_EX = join(here, 'fixtures', 'verify-view.no-exercise.generated.html');
const URL_NO_EX = '/tests/fixtures/verify-view.no-exercise.generated.html';

const captured = {
  run: 'pnpm --filter @spectastic/core build',
  // toggle deliberately omitted → must render loudly
  tests: 'pnpm vitest run verify',
  testsCite: ['T-100', 'T-101'],
  demo: 'spectastic verify 999-fixture, then open verify.html',
  demoCite: ['SC-001'],
  // 083: the entry point. Deliberately a URL, which is the case the interview
  // settled for a feature `run` already serves — and the case NFR-002 says must
  // stay inert.
  exercise: 'open http://localhost:3000/settings',
};

test.beforeAll(() => {
  const model = readBundle(
    readFileSync(join(fix, 'spec.html'), 'utf8'),
    readFileSync(join(fix, 'tasks.html'), 'utf8'),
    '999-fixture',
  );
  mkdirSync(join(here, 'fixtures'), { recursive: true });
  writeFileSync(FILE, renderVerifyHtml(model, captured));
  const { exercise: _omitted, ...withoutExercise } = captured;
  writeFileSync(FILE_NO_EX, renderVerifyHtml(model, withoutExercise));
});

test('US1 · the Run/Demo block shows the captured commands', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('spec-run')).toContainText('pnpm --filter @spectastic/core build');
  await expect(page.locator('spec-tests')).toContainText('pnpm vitest run verify');
  await expect(page.locator('spec-demo')).toContainText('open verify.html');
});

test('US1 · an unrecorded field renders LOUDLY, not blank (FR-009)', async ({ page }) => {
  await page.goto(URL);
  const after = await page.locator('spec-toggle').evaluate((el) => getComputedStyle(el, '::after').content);
  expect(after).toContain('not recorded');
});

/**
 * The exercise row (spec 083). Three assertions, because a new element inherits
 * neither its label nor its empty-state from the existing selector lists — it
 * is added to both by hand, and 048 shipped a block whose typed elements had
 * render logic and zero CSS. "It rendered" would not have caught that.
 */
test('021 FR-004 · an omitted toggle gaps loudly, so relaxing the requirement changes no behaviour', async ({ page }) => {
  await page.goto(URL);
  // The primary fixture omits `toggle` deliberately. Now that FR-004 permits
  // that instead of demanding the literal string "none", this is the assertion
  // that the permission costs a reader nothing: absence is still visible.
  const after = await page.locator('spec-toggle').evaluate((el) => getComputedStyle(el, '::after').content);
  expect(after).toContain('not recorded');
  expect((await page.locator('spec-toggle').textContent())?.trim()).toBe('');
});

test('083 · the exercise row is labelled, not an unlabelled mystery column', async ({ page }) => {
  await page.goto(URL);
  const label = await page.locator('spec-exercise').evaluate((el) => getComputedStyle(el, '::before').content);
  expect(label).toContain('Exercise');
});

test('083 · the exercise label fits its column rather than overlapping the value (T-113)', async ({ page }) => {
  await page.goto(URL);
  // Resolves the design's open spike. The grid reserves 5.5rem for the label;
  // "EXERCISE" is the longest label in the block. Arithmetic said it fits, which
  // is exactly the kind of claim the containment discipline exists to distrust.
  const { labelWidth, columnWidth } = await page.locator('spec-exercise').evaluate((el) => {
    const cs = getComputedStyle(el);
    const probe = document.createElement('span');
    const before = getComputedStyle(el, '::before');
    probe.textContent = before.content.replace(/"/g, '');
    probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-family:${before.fontFamily};font-size:${before.fontSize};font-weight:${before.fontWeight};letter-spacing:${before.letterSpacing};text-transform:${before.textTransform}`;
    document.body.appendChild(probe);
    const labelWidth = probe.getBoundingClientRect().width;
    probe.remove();
    return { labelWidth, columnWidth: Number.parseFloat(cs.gridTemplateColumns.split(' ')[0] ?? '0') };
  });
  expect(columnWidth).toBeGreaterThan(0);
  expect(labelWidth).toBeLessThanOrEqual(columnWidth);
});

test('083 · an uncaptured exercise entry point gaps LOUDLY, not blank (T-200, FR-004)', async ({ page }) => {
  await page.goto(URL_NO_EX);
  // The failure this guards is precise: a new element added to the renderer but
  // missed in the stylesheet's `:empty` selector list renders as a silent blank,
  // which every structural check and every "it exists" assertion would pass.
  const after = await page.locator('spec-exercise').evaluate((el) => getComputedStyle(el, '::after').content);
  expect(after).toContain('not recorded');
});

test('083 · a URL entry point renders as inert text, never a link (NFR-002, P-11)', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('spec-exercise')).toHaveText('open http://localhost:3000/settings');
  // An artifact is data. A captured address is quoted evidence, not navigation.
  expect(await page.locator('spec-exercise a').count()).toBe(0);
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

test('US2 · the trace links and Run block survive with JavaScript disabled (SC-005, NFR-001)', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(URL);
  await expect(page.locator('#trace a[href="./spec.html#SC-001"]')).toHaveCount(1);
  await expect(page.locator('spec-run')).toContainText('pnpm --filter @spectastic/core build');
  await ctx.close();
});
