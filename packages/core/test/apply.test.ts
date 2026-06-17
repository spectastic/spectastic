import { describe, expect, it } from 'vitest';
import { applyCommand } from '@spectastic/core/commands/apply';
import type { FileSystem, KernelContext } from '@spectastic/core';

function stubFs(initial: Record<string, string>): { fs: FileSystem; files: Map<string, string>; renames: Array<[string, string]> } {
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
  };
  return { fs, files, renames };
}

const LIVE_SPEC = `<!doctype html><html><body>
<spec-requirement id="FR-001" priority="must"><p>Original.</p></spec-requirement>
<section><spec-changelog><ol></ol></spec-changelog></section>
</body></html>`;

const APPLY_PROPOSAL = `<!doctype html><html><body>
<spec-change id="2026-06-16-foo" status="approved">
<spec-delta op="modified" target="FR-001">
  <spec-requirement id="FR-001" priority="must"><p>Updated.</p></spec-requirement>
</spec-delta>
</spec-change>
</body></html>`;

const BLOCKED_PROPOSAL = `<!doctype html><html><body>
<spec-risk target="FR-001" status="identified"><p>Risk.</p></spec-risk>
<spec-delta op="modified" target="FR-001"><spec-requirement id="FR-001" priority="must"><p>x</p></spec-requirement></spec-delta>
</body></html>`;

describe('applyCommand (010)', () => {
  it('apply mode: folds delta into live spec + archives folder', async () => {
    const { fs, files, renames } = stubFs({
      '/specs/001/spec.html': LIVE_SPEC,
      '/specs/001/changes/2026-06-16-foo/proposal.html': APPLY_PROPOSAL,
    });
    const ctx: KernelContext = { cwd: '', fs };

    const result = await applyCommand(
      { kind: 'apply', specId: '001', slug: '2026-06-16-foo' },
      ctx,
    );

    expect(result.deltas).toHaveLength(1);
    expect(result.deltas[0]?.op).toBe('modified');
    expect(result.deltas[0]?.result).toBe('success');
    const updated = files.get('/specs/001/spec.html')!;
    expect(updated).toContain('<p>Updated.</p>');
    expect(updated).not.toContain('<p>Original.</p>');
    expect(updated).toContain('Applied');
    expect(renames).toHaveLength(1);
    expect(renames[0]?.[1]).toBe('/specs/001/changes/archive/2026-06-16-foo');
  });

  it('apply mode: refuses if any <spec-risk status="identified"> remains', async () => {
    const { fs } = stubFs({
      '/specs/001/spec.html': LIVE_SPEC,
      '/specs/001/changes/2026-06-16-foo/proposal.html': BLOCKED_PROPOSAL,
    });
    await expect(
      applyCommand({ kind: 'apply', specId: '001', slug: '2026-06-16-foo' }, { cwd: '', fs }),
    ).rejects.toThrow(/status="identified"/);
  });

  it('withdraw mode: flips status + moves folder to withdrawn/ + appends changelog entry', async () => {
    const { fs, files, renames } = stubFs({
      '/specs/001/spec.html': LIVE_SPEC,
      '/specs/001/changes/2026-06-16-foo/proposal.html': APPLY_PROPOSAL,
    });
    const result = await applyCommand(
      { kind: 'withdraw', specId: '001', slug: '2026-06-16-foo', reason: 'shape was wrong' },
      { cwd: '', fs },
    );

    expect(result.deltas).toHaveLength(0);
    expect(renames[0]?.[1]).toBe('/specs/001/changes/withdrawn/2026-06-16-foo');
    const updated = files.get('/specs/001/spec.html')!;
    expect(updated).toContain('Considered');
    expect(updated).toContain('withdrew');
    expect(updated).toContain('shape was wrong');
  });
});
