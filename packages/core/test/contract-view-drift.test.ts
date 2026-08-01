import type { FileSystem } from '@spectastic/core';
import { contractViewDriftFindings } from '@spectastic/core/commands/validate';
import { readContractDeclarations } from '@spectastic/schema/contract';
import { describe, expect, it } from 'vitest';

/**
 * contractViewDriftFindings() — spec 072-contract-embedded-view. Live
 * re-read and compare against the projected view, no stored digest (design
 * D-005) — the same shape as verify-view-stale. Deliberately tolerates a
 * line-ending-only difference (design §10), unlike 071's exact-byte D-006.
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
      return { isFile: files.has(path), isDirectory: false };
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

describe('contractViewDriftFindings (072)', () => {
  it('T-200: editing the contract without regenerating produces exactly 1 finding', async () => {
    const html = `<spec-contract shape="request-response" path="api/x.yaml"><p>r</p><spec-contract-view lines="2">line one
line two</spec-contract-view></spec-contract>`;
    const decls = readContractDeclarations(html, 'design.html');
    const fs = stubFs({ '/repo/api/x.yaml': 'line one\nline two EDITED' }); // edited since materialisation

    const findings = await contractViewDriftFindings(decls, 'specs/x/design.html', fs, '/repo');

    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('contract-view-stale');
    expect(findings[0]?.message).toMatch(/api\/x\.yaml/);
  });

  it('T-200: regenerating (view matches current content) clears the finding to 0', async () => {
    const html = `<spec-contract shape="request-response" path="api/x.yaml"><p>r</p><spec-contract-view lines="2">line one
line two</spec-contract-view></spec-contract>`;
    const decls = readContractDeclarations(html, 'design.html');
    const fs = stubFs({ '/repo/api/x.yaml': 'line one\nline two' }); // matches exactly

    const findings = await contractViewDriftFindings(decls, 'specs/x/design.html', fs, '/repo');

    expect(findings).toHaveLength(0);
  });

  it('T-201: a checkout that rewrote line endings does not produce a finding (design §10)', async () => {
    const html = `<spec-contract shape="request-response" path="api/x.yaml"><p>r</p><spec-contract-view lines="2">line one
line two</spec-contract-view></spec-contract>`;
    const decls = readContractDeclarations(html, 'design.html');
    const fs = stubFs({ '/repo/api/x.yaml': 'line one\r\nline two\r\n' }); // CRLF + trailing newline — same content

    const findings = await contractViewDriftFindings(decls, 'specs/x/design.html', fs, '/repo');

    expect(findings).toHaveLength(0);
  });

  it('T-302: an excerpt compares only the leading lines it claims to show', async () => {
    const html = `<spec-contract shape="request-response" path="api/x.yaml"><p>r</p><spec-contract-view lines="5" excerpt="true">line 0
line 1</spec-contract-view></spec-contract>`;
    const decls = readContractDeclarations(html, 'design.html');
    // The file's full 5 lines — lines 2-4 (beyond the excerpt) have been edited,
    // but the excerpted leading two lines (0, 1) are untouched.
    const fs = stubFs({ '/repo/api/x.yaml': 'line 0\nline 1\nline 2 EDITED\nline 3 EDITED\nline 4 EDITED' });

    const findings = await contractViewDriftFindings(decls, 'specs/x/design.html', fs, '/repo');

    expect(findings).toHaveLength(0); // invisible past the cut — the recorded residual (design §10)
  });

  it('T-302: an excerpt DOES flag drift within its own leading lines', async () => {
    const html = `<spec-contract shape="request-response" path="api/x.yaml"><p>r</p><spec-contract-view lines="5" excerpt="true">line 0
line 1</spec-contract-view></spec-contract>`;
    const decls = readContractDeclarations(html, 'design.html');
    const fs = stubFs({ '/repo/api/x.yaml': 'line 0 EDITED\nline 1\nline 2\nline 3\nline 4' });

    const findings = await contractViewDriftFindings(decls, 'specs/x/design.html', fs, '/repo');

    expect(findings).toHaveLength(1);
  });

  it('a declaration with no view produces no finding', async () => {
    const html = `<spec-contract shape="request-response" path="api/x.yaml"><p>r</p></spec-contract>`;
    const decls = readContractDeclarations(html, 'design.html');
    const fs = stubFs({ '/repo/api/x.yaml': 'anything' });

    const findings = await contractViewDriftFindings(decls, 'specs/x/design.html', fs, '/repo');

    expect(findings).toHaveLength(0);
  });

  it('a view whose file has since been deleted or moved is flagged (unreadable)', async () => {
    const html = `<spec-contract shape="request-response" path="api/gone.yaml"><p>r</p><spec-contract-view lines="1">content</spec-contract-view></spec-contract>`;
    const decls = readContractDeclarations(html, 'design.html');
    const fs = stubFs({});

    const findings = await contractViewDriftFindings(decls, 'specs/x/design.html', fs, '/repo');

    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toMatch(/could not be read/);
  });
});
