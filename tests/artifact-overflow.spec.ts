import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

/**
 * `REQ-FORMAT-007` — an artifact contains its own wide content.
 *
 * At a 390 px viewport the page scrolls vertically only; tables, code blocks,
 * diagrams and definition lists scroll or reflow inside their own bounds.
 *
 * This is a *containment* test, which the project's own discipline says is the
 * one that catches real layout breakage: asserting an element rendered misses
 * both ways layout actually fails — content overspilling its box, and the page
 * growing wider than the viewport. So it measures `scrollWidth - clientWidth`
 * on the document, which is exactly the symptom a reader experiences as
 * sideways scrolling.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NARROW = { width: 390, height: 844 };

function artifacts(): string[] {
  const out: string[] = [];
  for (const d of readdirSync(`${ROOT}/specs`)) {
    for (const f of ['spec.html', 'design.html', 'tasks.html', 'verify.html', 'triage-log.html']) {
      if (existsSync(`${ROOT}/specs/${d}/${f}`)) out.push(`specs/${d}/${f}`);
    }
  }
  for (const f of ['principles.html', 'inbox.html']) if (existsSync(`${ROOT}/${f}`)) out.push(f);
  // Templates are artifacts too, and they are the ones every downstream project
  // starts from — a template that overflows ships the defect to every project
  // scaffolded from it, which is the widest blast radius in the estate.
  for (const f of readdirSync(`${ROOT}/templates`)) if (f.endsWith('.html')) out.push(`templates/${f}`);
  return out;
}

// One test that opens EVERY artifact in the estate — ~500 files, each a real
// navigation plus a layout read. It outgrew Playwright's 30s default as the
// estate grew (it takes ~36s alone, more under full-suite parallelism), and was
// timing out rather than failing an assertion. The budget is explicit so the
// distinction stays visible: a red here should mean an artifact overflows, never
// that the scan ran out of clock.
test('no artifact scrolls horizontally at 390px (REQ-FORMAT-007)', async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await browser.newPage({ viewport: NARROW });
  const overflowing: { file: string; by: number }[] = [];
  for (const file of artifacts()) {
    await page.goto(`file://${ROOT}/${file}`);
    const by = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (by > 0) overflowing.push({ file, by });
  }
  await page.close();
  const report = overflowing
    .sort((a, b) => b.by - a.by)
    .map((o) => `  ${String(o.by).padStart(5)}px  ${o.file}`)
    .join('\n');
  expect(overflowing, `${overflowing.length} artifact(s) overflow at 390px:\n${report}`).toEqual([]);
});
