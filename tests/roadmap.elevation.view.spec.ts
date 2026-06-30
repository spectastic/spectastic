import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { orderCommand } from '../packages/core/dist/commands/order.js';

/**
 * Behavioural guard for the elevation + WSJF facets of roadmap.html (spec
 * 028-dependency-ordering, T-312). The elevated foundation must appear ahead of
 * a higher-own-value leaf in the rendered order, and the WSJF-divergence mark
 * must be visible where RICE and WSJF disagree (FR-004, FR-008, SC-003).
 */

const here = dirname(fileURLToPath(import.meta.url));
const FILE = join(here, 'fixtures', 'roadmap.elevation.generated.html');
const URL = '/tests/fixtures/roadmap.elevation.generated.html';

function htmlFor(
  id: string,
  o: { parent?: string; deferTo?: string[]; rice?: [number, number, number, number] },
): string {
  const parent = o.parent ? `<spec-parent specid="${o.parent}"></spec-parent>` : '';
  const defers = (o.deferTo ?? []).map((t) => `<li defer-to="${t}">x</li>`).join('');
  const oos = defers ? `<spec-out-of-scope><ul>${defers}</ul></spec-out-of-scope>` : '';
  const rice = o.rice
    ? `<spec-rice reach="${o.rice[0]}" impact="${o.rice[1]}" confidence="${o.rice[2]}" effort="${o.rice[3]}"></spec-rice>`
    : '';
  return `<!doctype html><html><body><h1>${id}</h1>${parent}${oos}${rice}</body></html>`;
}

const corpus = [
  { specId: '001-foundation', html: htmlFor('001-foundation', { deferTo: ['002-big'], rice: [4, 4, 1, 2] }) },
  { specId: '002-big', html: htmlFor('002-big', { parent: '001-foundation', rice: [10, 10, 1, 1] }) },
  { specId: '003-leaf', html: htmlFor('003-leaf', { rice: [3, 3, 1, 1] }) },
];

test.beforeAll(async () => {
  const { html } = await orderCommand({ corpus, assetsPrefix: '../../assets' }, { cwd: '.' });
  mkdirSync(join(here, 'fixtures'), { recursive: true });
  writeFileSync(FILE, html);
});

test('the elevated foundation appears ahead of the higher-own-value leaf (FR-004)', async ({
  page,
}) => {
  await page.goto(URL);
  const ids = (await page.locator('#order tbody tr td:nth-child(2)').allTextContents()).map((t) =>
    t.trim().split(/\s/)[0],
  );
  expect(ids.indexOf('001-foundation')).toBeLessThan(ids.indexOf('003-leaf'));
  const row = page.locator('#order tbody tr', { hasText: '001-foundation' });
  await expect(row.locator('spec-pill')).toContainText('elevated');
});

test('the WSJF-divergence mark is visible where RICE and WSJF disagree (FR-008)', async ({
  page,
}) => {
  await page.goto(URL);
  const foundationRow = page.locator('#order tbody tr', { hasText: '001-foundation' });
  await expect(foundationRow.locator('abbr')).toBeVisible();
  await expect(foundationRow.locator('abbr')).toContainText('WSJF');
});
