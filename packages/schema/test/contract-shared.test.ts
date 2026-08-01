import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Unit tests for `readContractDeclarations()` (spec 070-contract-sidecar-convention,
 * D-001). Written before the reader exists (T-010) — failing until T-011/T-012 land.
 *
 * The record is deliberately wider than 070 needs (design §9 risk row) — it carries
 * shape/direction/path/format though 070 itself only reads path, so 071–074 need no
 * shape change once this lands.
 */

const FIXTURES = join(__dirname, '..', 'fixtures', 'contract-declarations');

function read(file: string): string {
  return readFileSync(join(FIXTURES, file), 'utf8');
}

describe('readContractDeclarations', () => {
  it('returns an empty array for a document with no <spec-contract> at all', async () => {
    const { readContractDeclarations } = await import('../src/contract-shared.js');
    expect(readContractDeclarations(read('none.html'))).toEqual([]);
  });

  it('tolerates a shape="none" element carrying no path', async () => {
    const { readContractDeclarations } = await import('../src/contract-shared.js');
    const decls = readContractDeclarations(read('no-interface.html'));
    expect(decls).toHaveLength(1);
    expect(decls[0]?.shape).toBe('none');
    expect(decls[0]?.path).toBeUndefined();
  });

  it('returns one record with shape/path/format/line/column for a single declaration', async () => {
    const { readContractDeclarations } = await import('../src/contract-shared.js');
    const decls = readContractDeclarations(read('one-declared.html'));
    expect(decls).toHaveLength(1);
    const [d] = decls;
    expect(d?.shape).toBe('request-response');
    expect(d?.path).toBe('api/openapi.yaml');
    expect(d?.format).toBe('openapi');
    expect(typeof d?.line).toBe('number');
    expect(typeof d?.column).toBe('number');
  });

  it('returns one record per declaration, and carries direction= when present', async () => {
    const { readContractDeclarations } = await import('../src/contract-shared.js');
    const decls = readContractDeclarations(read('two-declared.html'));
    expect(decls).toHaveLength(2);
    expect(decls[0]?.path).toBe('api/openapi.yaml');
    expect(decls[1]?.path).toBe('asyncapi.yaml');
    expect(decls[1]?.direction).toBe('publishes');
  });

  // 072-contract-embedded-view: the nested <spec-contract-view>, when present,
  // is read alongside the declaration — undefined/false when absent (FR-007/
  // FR-008 — a legal, common state).
  it('carries no view fields when the declaration has no nested <spec-contract-view>', async () => {
    const { readContractDeclarations } = await import('../src/contract-shared.js');
    const html = `<spec-contract shape="request-response" path="api/x.yaml"><p>reasoning</p></spec-contract>`;
    const decls = readContractDeclarations(html);
    expect(decls[0]?.viewLines).toBeUndefined();
    expect(decls[0]?.viewExcerpt).toBe(false);
    expect(decls[0]?.viewText).toBeUndefined();
  });

  it("reads a nested view's lines=, excerpt=, and verbatim (whitespace-preserved) text", async () => {
    const { readContractDeclarations } = await import('../src/contract-shared.js');
    const html = `<spec-contract shape="request-response" path="api/x.yaml"><p>reasoning</p><spec-contract-view lines="3" excerpt="true">line one
line two
line three</spec-contract-view></spec-contract>`;
    const decls = readContractDeclarations(html);
    expect(decls[0]?.viewLines).toBe(3);
    expect(decls[0]?.viewExcerpt).toBe(true);
    expect(decls[0]?.viewText).toBe('line one\nline two\nline three');
  });

  it("decodes HTML entities in a view's text back to the original characters", async () => {
    const { readContractDeclarations } = await import('../src/contract-shared.js');
    const html = `<spec-contract shape="request-response" path="api/x.yaml"><p>r</p><spec-contract-view lines="1">&lt;script&gt;alert(1)&lt;/script&gt;</spec-contract-view></spec-contract>`;
    const decls = readContractDeclarations(html);
    expect(decls[0]?.viewText).toBe('<script>alert(1)</script>');
  });

  it("a two-declaration document reads each one's own view independently, never a sibling's", async () => {
    const { readContractDeclarations } = await import('../src/contract-shared.js');
    const html = [
      `<spec-contract shape="request-response" path="api/a.yaml"><p>a</p><spec-contract-view lines="1">content-a</spec-contract-view></spec-contract>`,
      `<spec-contract shape="request-response" path="api/b.yaml"><p>b</p></spec-contract>`,
    ].join('\n');
    const decls = readContractDeclarations(html);
    expect(decls).toHaveLength(2);
    expect(decls[0]?.viewText).toBe('content-a');
    expect(decls[1]?.viewText).toBeUndefined();
  });
});

/**
 * The stable coordinate name (spec 076-contract-export-handover, D-002 /
 * SC-002). A coordinate names what a contract *is*, not where its file sits, so
 * a producer reorganising its own repository must not break a consumer that
 * pinned one.
 */
describe('contractCoordinateName (076, D-002)', () => {
  it('defaults to the path basename without extension at first authoring', async () => {
    const { contractCoordinateName } = await import('../src/contract-shared.js');
    expect(contractCoordinateName(undefined, 'api/invoices.yaml')).toBe('invoices');
    expect(contractCoordinateName(undefined, 'settlements.proto')).toBe('settlements');
    expect(contractCoordinateName(undefined, 'src/main/proto/billing/v1/billing.proto')).toBe('billing');
  });

  it('an explicit name= always wins over the derived default', async () => {
    const { contractCoordinateName } = await import('../src/contract-shared.js');
    expect(contractCoordinateName('invoices', 'api/renamed-file.yaml')).toBe('invoices');
  });

  it('SC-002: the same declared name yields the same coordinate however the file moves', async () => {
    const { contractCoordinateName } = await import('../src/contract-shared.js');
    const paths = ['invoices.yaml', 'api/invoices.yaml', 'src/main/openapi/v2/invoices.yaml'];
    const names = paths.map((p) => contractCoordinateName('invoices', p));
    expect(new Set(names).size).toBe(1);
  });

  it('is undefined when there is no path and no declared name (shape="none")', async () => {
    const { contractCoordinateName } = await import('../src/contract-shared.js');
    expect(contractCoordinateName(undefined, undefined)).toBeUndefined();
  });

  it('a whitespace-only name= falls back to the derived default rather than an empty coordinate', async () => {
    const { contractCoordinateName } = await import('../src/contract-shared.js');
    expect(contractCoordinateName('   ', 'api/invoices.yaml')).toBe('invoices');
  });

  it('a dotfile-style name with no extension keeps its whole basename', async () => {
    const { contractCoordinateName } = await import('../src/contract-shared.js');
    expect(contractCoordinateName(undefined, 'api/openapi')).toBe('openapi');
  });

  it('readContractDeclarations carries the coordinate name through', async () => {
    const { readContractDeclarations } = await import('../src/contract-shared.js');
    const html = `<spec-contract shape="request-response" path="api/invoices.yaml"><p>r</p></spec-contract>`;
    expect(readContractDeclarations(html)[0]?.coordinateName).toBe('invoices');
  });

  it('readContractDeclarations honours an explicit name= on the element', async () => {
    const { readContractDeclarations } = await import('../src/contract-shared.js');
    const html = `<spec-contract shape="request-response" name="billing" path="api/renamed.yaml"><p>r</p></spec-contract>`;
    expect(readContractDeclarations(html)[0]?.coordinateName).toBe('billing');
  });
});
