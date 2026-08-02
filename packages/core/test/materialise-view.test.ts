import type { FileSystem } from '@spectastic/core';
import { materialiseContractViews } from '@spectastic/core/contracts/materialise-view';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const HOSTILE_FIXTURE = resolve(here, 'fixtures', 'contract-view', 'hostile.yaml');

/**
 * materialiseContractViews() — spec 072-contract-embedded-view. Reads each
 * declared contract file and injects a nested <spec-contract-view>, escaped
 * and line-capped; an absent/unreadable/non-text file is omitted rather than
 * rendered empty (FR-007).
 */

function stubFs(initial: Record<string, string>): FileSystem {
  const files = new Map(Object.entries(initial));
  return {
    async readFile(path) {
      const c = files.get(path);
      if (c === undefined) throw new Error(`ENOENT: ${path}`);
      return c;
    },
    async writeFile(path, content) {
      files.set(path, content);
    },
    async readdir() {
      return [];
    },
    async stat(path) {
      if (!files.has(path)) throw new Error(`ENOENT: ${path}`);
      return { isFile: !path.endsWith('/'), isDirectory: path.endsWith('/') };
    },
    async rename(from, to) {
      files.set(to, files.get(from) ?? '');
      files.delete(from);
    },
    async rm(path) {
      files.delete(path);
    },
    async mkdir() {
      // no-op
    },
  };
}

describe('materialiseContractViews (072)', () => {
  it('T-100: copies the contract text into a nested view, escaped, next to its declaration', async () => {
    const html = `<spec-contract shape="request-response" path="api/openapi.yaml" format="OpenAPI"><p>reasoning</p></spec-contract>`;
    const fs = stubFs({ '/repo/api/openapi.yaml': 'openapi: 3.0.0\ninfo: {title: v1}' });

    const result = await materialiseContractViews(html, fs, '/repo');

    expect(result).toContain('<p>reasoning</p>'); // authored reasoning untouched
    expect(result).toMatch(
      /<spec-contract-view lines="2"[^>]*>openapi: 3\.0\.0\ninfo: \{title: v1\}<\/spec-contract-view>/,
    );
  });

  it('T-101: a hostile contract renders as visible escaped characters, never executable', async () => {
    const html = `<spec-contract shape="request-response" path="api/hostile.yaml" format="OpenAPI"><p>reasoning</p></spec-contract>`;
    const fs = stubFs({
      '/repo/api/hostile.yaml': '<script>alert(1)</script> <img onerror="x()"> javascript:void(0)',
    });

    const result = await materialiseContractViews(html, fs, '/repo');

    expect(result).not.toContain('<script>alert(1)</script>');
    expect(result).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result).not.toMatch(/<img onerror=/);
    expect(result).toContain('&lt;img onerror=&quot;x()&quot;&gt;');
  });

  it('T-002/T-101: the real hostile fixture (script, onerror, javascript: URI) renders inert', async () => {
    const html = `<spec-contract shape="request-response" path="api/hostile.yaml" format="OpenAPI"><p>reasoning</p></spec-contract>`;
    const hostileContent = readFileSync(HOSTILE_FIXTURE, 'utf8');
    const fs = stubFs({ '/repo/api/hostile.yaml': hostileContent });

    const result = await materialiseContractViews(html, fs, '/repo');

    expect(result).not.toContain('<script>alert(1)</script>');
    expect(result).not.toMatch(/<img[^&]*onerror=/); // never a live attribute — only its escaped text
    expect(result).not.toContain('href="javascript:alert(1)"');
    expect(result).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('T-102: an absent contract file produces no view at all — declaration stands alone', async () => {
    const html = `<spec-contract shape="request-response" path="api/missing.yaml" format="OpenAPI"><p>reasoning</p></spec-contract>`;
    const fs = stubFs({});

    const result = await materialiseContractViews(html, fs, '/repo');

    expect(result).not.toContain('spec-contract-view');
    expect(result).toContain('<p>reasoning</p>');
  });

  it('T-102: a directory at the declared path produces no view', async () => {
    const html = `<spec-contract shape="request-response" path="api/" format="OpenAPI"><p>reasoning</p></spec-contract>`;
    const fs = stubFs({ '/repo/api/': '' });

    const result = await materialiseContractViews(html, fs, '/repo');

    expect(result).not.toContain('spec-contract-view');
  });

  it('T-102: a binary (NUL-containing) contract produces no view', async () => {
    const html = `<spec-contract shape="request-response" path="api/binary.bin" format="OpenAPI"><p>reasoning</p></spec-contract>`;
    const fs = stubFs({ '/repo/api/binary.bin': 'abc\0def' });

    const result = await materialiseContractViews(html, fs, '/repo');

    expect(result).not.toContain('spec-contract-view');
  });

  it('a declaration with no path (shape="none") produces no view', async () => {
    const html = `<spec-contract shape="none"><p>no interface</p></spec-contract>`;
    const fs = stubFs({});

    const result = await materialiseContractViews(html, fs, '/repo');

    expect(result).toBe(html);
  });

  it('a document with no <spec-contract> at all is returned unchanged', async () => {
    const html = `<html><body><p>nothing here</p></body></html>`;
    const fs = stubFs({});

    const result = await materialiseContractViews(html, fs, '/repo');

    expect(result).toBe(html);
  });

  it('regeneration replaces an existing view rather than duplicating it', async () => {
    const html = `<spec-contract shape="request-response" path="api/openapi.yaml" format="OpenAPI"><p>reasoning</p>\n<spec-contract-view lines="1">old content</spec-contract-view>\n</spec-contract>`;
    const fs = stubFs({ '/repo/api/openapi.yaml': 'new content' });

    const result = await materialiseContractViews(html, fs, '/repo');

    expect(result.match(/<spec-contract-view/g)).toHaveLength(1);
    expect(result).toContain('new content');
    expect(result).not.toContain('old content');
  });

  it('T-301: a contract over the line budget renders an excerpt, states so, and keeps the real line count', async () => {
    const html = `<spec-contract shape="request-response" path="api/big.yaml" format="OpenAPI"><p>reasoning</p></spec-contract>`;
    const bigContent = Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n');
    const fs = stubFs({ '/repo/api/big.yaml': bigContent });

    const result = await materialiseContractViews(html, fs, '/repo', 5); // budget=5 for a fast test

    expect(result).toMatch(/<spec-contract-view lines="12" excerpt="true"/);
    expect(result).toContain('line 0');
    expect(result).toContain('line 4');
    expect(result).not.toContain('line 5'); // cut after the 5th line, never mid-line
    expect(result).not.toContain('line 11');
  });

  it('a conventional trailing newline is not counted as an extra line', async () => {
    const html = `<spec-contract shape="request-response" path="api/x.yaml" format="OpenAPI"><p>reasoning</p></spec-contract>`;
    const fs = stubFs({ '/repo/api/x.yaml': 'line one\nline two\n' }); // 2 real lines + trailing newline

    const result = await materialiseContractViews(html, fs, '/repo');

    expect(result).toMatch(/<spec-contract-view lines="2" /); // not "3" — a naive split('\n') over-counts by one
  });

  it('a contract at or under the line budget is shown whole, with no excerpt attribute', async () => {
    const html = `<spec-contract shape="request-response" path="api/small.yaml" format="OpenAPI"><p>reasoning</p></spec-contract>`;
    const content = Array.from({ length: 5 }, (_, i) => `line ${i}`).join('\n');
    const fs = stubFs({ '/repo/api/small.yaml': content });

    const result = await materialiseContractViews(html, fs, '/repo', 5);

    expect(result).toMatch(/<spec-contract-view lines="5" /);
    expect(result).not.toContain('excerpt=');
  });

  it('multiple declarations in one document are each materialised independently', async () => {
    const html = [
      `<spec-contract shape="request-response" path="api/a.yaml" format="OpenAPI"><p>a</p></spec-contract>`,
      `<spec-contract shape="request-response" path="api/b.yaml" format="OpenAPI"><p>b</p></spec-contract>`,
    ].join('\n');
    const fs = stubFs({ '/repo/api/a.yaml': 'content-a', '/repo/api/b.yaml': 'content-b' });

    const result = await materialiseContractViews(html, fs, '/repo');

    expect(result).toContain('content-a');
    expect(result).toContain('content-b');
  });
});
