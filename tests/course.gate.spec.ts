import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
// Import the built kernel directly — the repo root isn't a workspace member, so the
// package specifier doesn't resolve here. Requires `pnpm --filter @spectastic/core build`.
import { assembleCourse } from '../packages/core/dist/commands/course.js';

/**
 * Behavioral guard for the quiz gate (019-explain-course FR-006 / SC-003, triage T-001).
 * The vitest SC-003 test is structural — it asserts the gate script is present but never
 * runs it. This drives a generated course in a real browser and proves the gate marks the
 * ANSWERED objective, not the last one (the closure-over-var regression).
 */

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_FILE = join(here, 'fixtures', 'course-gate.generated.html');
const FIXTURE_URL = '/tests/fixtures/course-gate.generated.html';

const draft = {
  target: 'gate-fixture',
  title: 'Gate fixture',
  objectives: [
    { title: 'First objective', read: 'r1', quiz: { question: 'q1', options: ['a', 'b', 'c'], correctIndex: 2, feedback: ['', '', 'yes'] }, teachBack: 'Explain the first.', refs: [] },
    { title: 'Last objective', read: 'r2', quiz: { question: 'q2', options: ['x', 'y'], correctIndex: 0, feedback: ['yes', ''] }, teachBack: 'Explain the last.', refs: [] },
  ],
};

test.beforeAll(() => {
  mkdirSync(join(here, 'fixtures'), { recursive: true });
  writeFileSync(FIXTURE_FILE, assembleCourse(draft, '2026-01-01-gate-fixture'));
});

/** Select an option in an objective's quiz and fire the gate's change handler. */
async function answer(page: import('@playwright/test').Page, objId: string, value: number) {
  await page.evaluate(
    ({ objId, value }) => {
      const r = document.querySelector(
        `input[name="quiz-${objId}"][value="${value}"]`,
      ) as HTMLInputElement | null;
      if (!r) throw new Error(`radio quiz-${objId} value ${value} not found`);
      r.checked = true;
      r.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { objId, value },
  );
}

test('a correct answer marks THIS objective — not the last (closure fix, T-001)', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await answer(page, 'T-001', 2); // objective 1's correct option
  await expect(page.locator('#T-001 input[type=checkbox]')).toBeChecked();
  await expect(page.locator('#T-002 input[type=checkbox]')).not.toBeChecked();
});

test('the last objective marks independently too', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await answer(page, 'T-002', 0); // objective 2's correct option
  await expect(page.locator('#T-002 input[type=checkbox]')).toBeChecked();
  await expect(page.locator('#T-001 input[type=checkbox]')).not.toBeChecked();
});

test('a wrong answer does not mark the objective', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await answer(page, 'T-001', 0); // wrong (correct is 2)
  await expect(page.locator('#T-001 input[type=checkbox]')).not.toBeChecked();
});

test('teach-back offers a place to respond (T-002)', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await expect(page.locator('textarea[name="teachback-T-001"]')).toHaveCount(1);
  await expect(page.locator('textarea[name="teachback-T-002"]')).toHaveCount(1);
});
