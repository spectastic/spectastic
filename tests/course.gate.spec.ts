import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
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
    {
      title: 'First objective',
      read: 'r1',
      quiz: {
        question: 'q1',
        options: ['a', 'b', 'c'],
        correctIndex: 2,
        feedback: ['fb-a', 'fb-b', 'fb-c'],
      },
      teachBack: 'Explain the first.',
      refs: [],
    },
    {
      title: 'Last objective',
      read: 'r2',
      quiz: {
        question: 'q2',
        options: ['x', 'y'],
        correctIndex: 0,
        feedback: ['yes', ''],
      },
      teachBack: 'Explain the last.',
      refs: [],
    },
  ],
};

test.beforeAll(() => {
  mkdirSync(join(here, 'fixtures'), { recursive: true });
  writeFileSync(FIXTURE_FILE, assembleCourse(draft, '2026-01-01-gate-fixture'));
});

/**
 * Select an option by its VISIBLE LABEL and fire the gate's change handler.
 *
 * Never by authored index: `assembleCourse` seed-shuffles each quiz's options
 * (`shuffleQuizOptions`), so a rendered `value="2"` is not the third option the
 * draft declared. These tests hardcoded the authored indices and went red when
 * shuffling landed — asserting against a position the learner never sees. The
 * label is what a learner actually picks, and it survives the shuffle.
 */
async function answer(page: import('@playwright/test').Page, objId: string, label: string) {
  await page.evaluate(
    ({ objId, label }) => {
      const radios = [...document.querySelectorAll(`input[name="quiz-${objId}"]`)] as HTMLInputElement[];
      const r = radios.find((radio) => radio.closest('label')?.textContent?.trim() === label);
      if (!r) throw new Error(`radio quiz-${objId} labelled "${label}" not found`);
      r.checked = true;
      r.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { objId, label },
  );
}

test('a correct answer marks THIS objective — not the last (closure fix, T-001)', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await answer(page, 'T-001', 'c'); // objective 1's correct option (authored correctIndex 2)
  await expect(page.locator('#T-001 input[type=checkbox]')).toBeChecked();
  await expect(page.locator('#T-002 input[type=checkbox]')).not.toBeChecked();
});

test('the last objective marks independently too', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await answer(page, 'T-002', 'x'); // objective 2's correct option (authored correctIndex 0)
  await expect(page.locator('#T-002 input[type=checkbox]')).toBeChecked();
  await expect(page.locator('#T-001 input[type=checkbox]')).not.toBeChecked();
});

test('a wrong answer does not mark the objective', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await answer(page, 'T-001', 'a'); // wrong (the correct option is 'c')
  await expect(page.locator('#T-001 input[type=checkbox]')).not.toBeChecked();
});

// The real user path: open the Quiz tab (spec.js hides inactive tabs), then click an
// option — so the verdict is genuinely visible, not just present in the DOM.
async function openQuizAndPick(page: import('@playwright/test').Page, label: string) {
  await page.locator('spec-tabs').first().getByRole('tab', { name: 'Quiz' }).click();
  // By label, for the same reason as `answer` above — the options are shuffled.
  await page
    .locator('label', { hasText: new RegExp(`^\\s*${label}\\s*$`) })
    .locator('input[type=radio]')
    .check();
}

test('a wrong answer reads as incorrect, with the CHOSEN option feedback (T-003)', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await openQuizAndPick(page, 'a'); // chose option a (wrong; correct is c)
  const verdict = page.locator('[data-obj="T-001"] .quiz-verdict');
  await expect(verdict).toBeVisible();
  await expect(verdict).toContainText('Not quite');
  await expect(verdict).toContainText('fb-a'); // the chosen option's feedback, not the correct one's
  await expect(verdict).not.toContainText('fb-c');
  await expect(page.locator('[data-obj="T-001"]')).toHaveClass(/incorrect/);
});

test('a correct answer reads as correct, with that option feedback (T-003)', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await openQuizAndPick(page, 'c'); // chose option c (correct)
  const verdict = page.locator('[data-obj="T-001"] .quiz-verdict');
  await expect(verdict).toBeVisible();
  await expect(verdict).toContainText('Correct');
  await expect(verdict).toContainText('fb-c');
  await expect(page.locator('[data-obj="T-001"]')).toHaveClass(/quiz correct/);
});

test('teach-back offers a place to respond (T-002)', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await expect(page.locator('textarea[name="teachback-T-001"]')).toHaveCount(1);
  await expect(page.locator('textarea[name="teachback-T-002"]')).toHaveCount(1);
});
