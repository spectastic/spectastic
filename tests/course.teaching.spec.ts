import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
// Import the built kernel directly — the repo root isn't a workspace member, so the
// package specifier doesn't resolve here. Requires `pnpm --filter @spectastic/core build`.
import { assembleCourse } from '../packages/core/dist/commands/course.js';

/**
 * Structural/Playwright backstop for the structured teaching payload
 * (060-course-teaching-payload T-202, NFR-001/SC-003). The vitest tests in
 * packages/core/test/course.test.ts are structural — they assert the
 * teaching-element markup is present but never open it in a browser. This
 * drives a generated course with all four members and proves each one
 * renders, stays contained (no overflow/clipping), and is legible with
 * JavaScript disabled — the CLAUDE.md "presence is not containment"
 * discipline, applied to a brand-new positioned surface.
 */

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_FILE = join(here, 'fixtures', 'course-teaching.generated.html');
const FIXTURE_URL = '/tests/fixtures/course-teaching.generated.html';

const draft = {
  target: 'teaching-fixture',
  title: 'Teaching payload fixture',
  objectives: [
    {
      title: 'Learn by comparison, then see it worked',
      read: {
        prose: 'A corpus-license rule classifies a declared license against a permissive allowlist.',
        analogy: {
          source: 'a bank teller checking a withdrawal',
          target: 'the corpus-license rule checking a declared license',
          mapping:
            'a withdrawal only clears if funds exist on the account; a license only clears if it is on the permissive allowlist — everything else is flagged for a human to look at.',
          refs: [],
        },
        contrast: {
          caseA: 'permissive allowlist',
          caseB: 'restrictive blocklist',
          dimensions: [
            {
              label: 'unknown license',
              a: 'warns (conservative)',
              b: 'silently passes (risky)',
            },
            {
              label: 'burden of proof',
              a: 'on being known-safe',
              b: 'on being known-bad',
            },
          ],
          refs: [],
        },
        workedExample: {
          steps: [
            'Read the document’s declared license string, e.g. "CC-BY-NC-4.0".',
            'Normalise it (trim, lower-case) and check it against the permissive allowlist.',
            'Not found on the allowlist → emit a corpus-license warning naming the declared license.',
          ],
          refs: [],
        },
        illustration: {
          svg: '<svg viewBox="0 0 200 80" role="img" aria-label="license flow"><rect x="4" y="4" width="90" height="72" fill="none" stroke="currentColor"/><text x="10" y="44" font-size="10">license field</text><rect x="106" y="4" width="90" height="72" fill="none" stroke="currentColor"/><text x="112" y="44" font-size="10">allowlist check</text></svg>',
          caption: 'The declared license flows into a single allowlist check.',
          refs: [],
        },
      },
      quiz: {
        question: 'q1',
        options: ['a', 'b', 'c'],
        correctIndex: 1,
        feedback: ['no', 'yes', 'no'],
      },
      refs: [],
    },
  ],
};

test.beforeAll(() => {
  mkdirSync(join(here, 'fixtures'), { recursive: true });
  writeFileSync(FIXTURE_FILE, assembleCourse(draft, '2026-07-26-teaching-fixture'));
});

test('every teaching member renders (NFR-001, SC-003)', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  // spec.js hides inactive <spec-tab> panels; open Read to see the members.
  await page.locator('spec-tabs').first().getByRole('tab', { name: 'Read' }).click();
  await expect(page.locator('course-analogy')).toBeVisible();
  await expect(page.locator('course-contrast')).toBeVisible();
  await expect(page.locator('course-worked-example')).toBeVisible();
  await expect(page.locator('course-illustration')).toBeVisible();
  await expect(page.locator('course-illustration svg')).toBeVisible();
});

test('every teaching member stays contained — no overflow or clipping', async ({ page }) => {
  await page.goto(FIXTURE_URL);
  await page.locator('spec-tabs').first().getByRole('tab', { name: 'Read' }).click();
  const viewport = page.viewportSize();
  for (const tag of ['course-analogy', 'course-contrast', 'course-worked-example', 'course-illustration']) {
    const el = page.locator(tag);
    const overflow = await el.evaluate((n) => n.scrollWidth - n.clientWidth);
    expect(overflow, `${tag} horizontal overflow`).toBeLessThanOrEqual(1);
    const box = await el.boundingBox();
    expect(box, `${tag} has a bounding box`).not.toBeNull();
    if (box && viewport) {
      expect(box.x, `${tag} left edge on-screen`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${tag} right edge on-screen`).toBeLessThanOrEqual(viewport.width + 1);
    }
  }
});

test('every teaching member is legible with JavaScript disabled (P-4)', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(FIXTURE_URL);
  // With no JS, spec.js's tab-hiding enhancement never runs, so every panel —
  // including Read, where the teaching members live — is plain visible HTML.
  await expect(page.locator('course-analogy')).toBeVisible();
  await expect(page.locator('course-contrast')).toBeVisible();
  await expect(page.locator('course-worked-example')).toBeVisible();
  await expect(page.locator('course-illustration')).toBeVisible();
  await ctx.close();
});
