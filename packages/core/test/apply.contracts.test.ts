import type { FileSystem, KernelContext } from '@spectastic/core';
import { applyCommand } from '@spectastic/core/commands/apply';
import { describe, expect, it } from 'vitest';

/**
 * End-to-end contract promotion through the real apply kernel (spec
 * 071-contract-promotion, design D-002/D-003 — project-structure §8's
 * apply.contracts.test.ts). Complements promote.plan.test.ts /
 * promote.execute.test.ts, which test planPromotion()/executePromotion() in
 * isolation; this proves applyCommand actually wires them in at the right
 * points relative to its own delta-fold and archive steps.
 */

function stubFs(initial: Record<string, string>): {
  fs: FileSystem;
  files: Map<string, string>;
  renames: Array<[string, string]>;
} {
  const files = new Map(Object.entries(initial));
  const renames: Array<[string, string]> = [];
  const fs: FileSystem = {
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
      renames.push([from, to]);
      files.set(to, files.get(from) ?? '');
      files.delete(from);
    },
    async rm(path) {
      files.delete(path);
    },
    async mkdir() {
      // no-op — flat map, not a real tree
    },
  };
  return { fs, files, renames };
}

const DESIGN_ONE_CONTRACT = `<!doctype html><html><body>
<spec-contract shape="request-response" path="api/openapi.yaml" format="OpenAPI"><p>reasoning</p></spec-contract>
</body></html>`;

const LIVE_SPEC = `<!doctype html><html><body>
<spec-requirement id="FR-001" priority="must"><p>Original.</p></spec-requirement>
<section><spec-changelog><ol></ol></spec-changelog></section>
</body></html>`;

const PROPOSAL = `<!doctype html><html><body>
<spec-change id="2026-08-01-foo" status="approved">
<spec-delta op="modified" target="FR-001">
  <spec-requirement id="FR-001" priority="must"><p>Updated.</p></spec-requirement>
</spec-delta>
</spec-change>
</body></html>`;

describe('applyCommand — contract promotion wiring (071)', () => {
  it('promotes a clean contract alongside the ordinary delta fold and archive', async () => {
    const { fs, files, renames } = stubFs({
      '/specs/500/spec.html': LIVE_SPEC,
      '/specs/500/design.html': DESIGN_ONE_CONTRACT,
      '/specs/500/changes/2026-08-01-foo/proposal.html': PROPOSAL,
      '/api/openapi.yaml': 'v1',
      '/specs/500/contracts/openapi.yaml': 'v2',
      '/specs/500/contracts/.baseline/openapi.yaml': 'v1',
    });
    const ctx: KernelContext = { cwd: '', fs };

    const result = await applyCommand({ kind: 'apply', specId: '500', slug: '2026-08-01-foo' }, ctx);

    expect(result.promotedContracts).toBe(1);
    expect(files.get('/api/openapi.yaml')).toBe('v2');
    expect(files.has('/specs/500/contracts/openapi.yaml')).toBe(false);
    // The proposed contract and its baseline were archived (rename recorded —
    // the stub's flat map doesn't simulate a real directory-tree move, exactly
    // as apply.test.ts's own stubFs asserts renames rather than post-move reads).
    expect(renames).toContainEqual([
      '/specs/500/contracts/openapi.yaml',
      '/specs/500/changes/archive/2026-08-01-foo/contracts/openapi.yaml',
    ]);
    expect(renames).toContainEqual([
      '/specs/500/contracts/.baseline/openapi.yaml',
      '/specs/500/changes/archive/2026-08-01-foo/contracts/.baseline/openapi.yaml',
    ]);
    // The unrelated delta fold and proposal archive still happened.
    expect(files.get('/specs/500/spec.html')).toContain('<p>Updated.</p>');
    expect(renames).toContainEqual(['/specs/500/changes/2026-08-01-foo', '/specs/500/changes/archive/2026-08-01-foo']);
  });

  it('refuses the whole apply — spec.html untouched — when the contract conflicts (SC-002)', async () => {
    const { fs, files } = stubFs({
      '/specs/501/spec.html': LIVE_SPEC,
      '/specs/501/design.html': DESIGN_ONE_CONTRACT,
      '/specs/501/changes/2026-08-01-foo/proposal.html': PROPOSAL,
      '/api/openapi.yaml': 'v3', // moved since the baseline was recorded
      '/specs/501/contracts/openapi.yaml': 'v2',
      '/specs/501/contracts/.baseline/openapi.yaml': 'v1',
    });
    const ctx: KernelContext = { cwd: '', fs };
    const before = new Map(files);

    await expect(applyCommand({ kind: 'apply', specId: '501', slug: '2026-08-01-foo' }, ctx)).rejects.toThrow(
      /refus/i,
    );

    expect(files).toEqual(before);
  });

  it('a change with no design.html or no declared contract is unaffected (FR-006)', async () => {
    const { fs, files } = stubFs({
      '/specs/502/spec.html': LIVE_SPEC,
      '/specs/502/changes/2026-08-01-foo/proposal.html': PROPOSAL,
    });
    const ctx: KernelContext = { cwd: '', fs };

    const result = await applyCommand({ kind: 'apply', specId: '502', slug: '2026-08-01-foo' }, ctx);

    expect(result.promotedContracts).toBe(0);
    expect(files.get('/specs/502/spec.html')).toContain('<p>Updated.</p>');
  });
});
