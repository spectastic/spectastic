import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
// Import the built engine directly — the repo root isn't a workspace member.
// Requires `pnpm --filter @spectastic/core build`.
import { readBundle, renderVerifyHtml } from '../packages/core/dist/commands/verify.js';

/**
 * Behavioural guard for the §Observables trace (spec 048-verify-slo-trace).
 * Structural string checks (packages/core/test/verify.observables.test.ts)
 * can't prove the section actually renders visibly, that a gap row is
 * distinguishable from a traced row, or that the table stays contained —
 * the CLAUDE.md "presence is not containment" discipline. Written test-first
 * (T-102): FAILS until §Observables renders (T-110).
 */

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, 'fixtures', 'verify-observables.generated.html');
const URL = '/tests/fixtures/verify-observables.generated.html';

// One traced NFR (a real SLO), one loud gap (quantified, no SLO), one quiet
// n/a (not quantified, no SLO) — exercises every row kind FR-001 defines.
const SPEC = `<!doctype html><html lang="en"><body><main>
<header><p class="small-caps">Specification · 999-obs</p></header>
<spec-requirement id="NFR-001" priority="must"><p>p95 latency &lt; 200 ms.</p></spec-requirement>
<spec-slo target="NFR-001" objective="99% &lt; 200ms" window="28d" budgeting="occurrences" signal="latency">fraction of requests served under 200 ms</spec-slo>
<spec-requirement id="NFR-002" priority="must"><p>p99 error rate &lt; 0.1%.</p></spec-requirement>
<spec-requirement id="NFR-003" priority="must"><p>The system must be secure.</p></spec-requirement>
</main></body></html>`;
const TASKS = `<!doctype html><html lang="en"><body><main></main></body></html>`;

test.beforeAll(() => {
  const model = readBundle(SPEC, TASKS, '999-obs');
  mkdirSync(join(here, 'fixtures'), { recursive: true });
  writeFileSync(FILE, renderVerifyHtml(model, undefined));
});

test('the §Observables section is visible and lists every NFR', async ({ page }) => {
  await page.goto(URL);
  const section = page.locator('#observables');
  await expect(section).toBeVisible();
  // Each NFR is linked to its spec anchor. NFR-002/NFR-003 (gap rows) also
  // repeat the id inside their gap/n-a message text — that's intentional
  // (more informative), so assert the link specifically, not a loose text
  // match that would double-count it.
  await expect(section.locator('a[href="./spec.html#NFR-001"]')).toHaveCount(1);
  await expect(section.locator('a[href="./spec.html#NFR-002"]')).toHaveCount(1);
  await expect(section.locator('a[href="./spec.html#NFR-003"]')).toHaveCount(1);
});

test('a loud gap (NFR-002, quantified, no SLO) is visually distinct from a traced row', async ({ page }) => {
  await page.goto(URL);
  const section = page.locator('#observables');
  // Traced NFR-001's SLI text colour, vs the loud-gap cell's colour — must differ.
  const traced = section.getByText('fraction of requests served under 200 ms');
  const tracedColor = await traced.evaluate((el) => getComputedStyle(el).color);
  const gapCell = section.locator('strong', { hasText: /NFR-002/ }).first();
  await expect(gapCell).toBeVisible();
  const gapColor = await gapCell.evaluate((el) => getComputedStyle(el).color);
  expect(gapColor).not.toBe(tracedColor);
});

test('a quiet n/a (NFR-003, not quantified, no SLO) renders plain — not the loud style', async ({ page }) => {
  await page.goto(URL);
  const section = page.locator('#observables');
  const naCell = section.getByText('n/a', { exact: false }).first();
  await expect(naCell).toBeVisible();
  // Not wrapped in the loud gap's <strong> — a plain-text cell.
  const tagName = await naCell.evaluate((el) => el.closest('strong') === null);
  expect(tagName).toBe(true);
});

test('the §Observables table does not overflow its section (containment)', async ({ page }) => {
  await page.goto(URL);
  const section = page.locator('#observables');
  const overflow = await section.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1); // sub-pixel rounding tolerance
});
