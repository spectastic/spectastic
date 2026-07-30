import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
// Import the built engine directly — the repo root isn't a workspace member.
// Requires `pnpm --filter @spectastic/core build`.
import { orderCommand } from '../packages/core/dist/commands/order.js';

/**
 * Behavioural guard for roadmap.html (spec 028-dependency-ordering, T-115).
 * Browser-level per P-7 / CLAUDE.md: structural checks can't prove the order
 * renders in dependency sequence, the unranked flag shows, the table stays
 * contained (presence ≠ containment), or that it reads with JS off.
 */

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, 'fixtures', 'roadmap.generated.html');
const URL = '/tests/fixtures/roadmap.generated.html';

const corpus = [
  { specId: '001-a', html: htmlFor('001-a', { deferTo: ['002-b', '003-c'] }) },
  {
    specId: '002-b',
    html: htmlFor('002-b', { parent: '001-a', rice: [5, 5, 1, 1] }),
  },
  {
    specId: '003-c',
    html: htmlFor('003-c', { parent: '001-a', rice: [1, 1, 1, 1] }),
  },
  { specId: '004-unranked', html: htmlFor('004-unranked', {}) },
];

function htmlFor(
  id: string,
  o: {
    parent?: string;
    deferTo?: string[];
    rice?: [number, number, number, number];
  },
): string {
  const parent = o.parent ? `<spec-parent specid="${o.parent}"></spec-parent>` : '';
  const defers = (o.deferTo ?? []).map((t) => `<li defer-to="${t}">x</li>`).join('');
  const oos = defers ? `<spec-out-of-scope><ul>${defers}</ul></spec-out-of-scope>` : '';
  const rice = o.rice
    ? `<spec-rice reach="${o.rice[0]}" impact="${o.rice[1]}" confidence="${o.rice[2]}" effort="${o.rice[3]}"></spec-rice>`
    : '';
  return `<!doctype html><html><body><h1>${id}</h1>${parent}${oos}${rice}</body></html>`;
}

test.beforeAll(async () => {
  const { html } = await orderCommand({ corpus, assetsPrefix: '../../assets' }, { cwd: '.' });
  mkdirSync(join(here, 'fixtures'), { recursive: true });
  writeFileSync(FILE, html);
});

test('the order renders in dependency sequence — parent before its children', async ({ page }) => {
  await page.goto(URL);
  const ids = await page.locator('#order tbody tr td:nth-child(2)').allTextContents();
  const trimmed = ids.map((t) => t.trim().split(/\s/)[0]);
  expect(trimmed.indexOf('001-a')).toBeLessThan(trimmed.indexOf('002-b'));
  expect(trimmed.indexOf('002-b')).toBeLessThan(trimmed.indexOf('003-c'));
});

test('an un-RICE spec is shown and tagged unranked, never dropped (FR-006)', async ({ page }) => {
  await page.goto(URL);
  const row = page.locator('#order tbody tr', { hasText: '004-unranked' });
  await expect(row).toHaveCount(1);
  await expect(row.locator('spec-pill')).toContainText('unranked');
});

test('the order table is contained — no horizontal overflow, sits within the viewport', async ({ page }) => {
  await page.goto(URL);
  const table = page.locator('#order table');
  const fits = await table.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  expect(fits).toBe(true);
  const box = await table.boundingBox();
  const vp = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual((vp?.width ?? 0) + 1);
});

test('the ordered list survives with JavaScript disabled (P-4)', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(URL);
  // The rows are static HTML in source order — present without JS.
  await expect(page.locator('#order tbody tr')).toHaveCount(4);
  await ctx.close();
});
