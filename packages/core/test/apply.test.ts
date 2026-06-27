import { describe, expect, it } from 'vitest';
import { applyCommand } from '@spectastic/core/commands/apply';
import type { FileSystem, KernelContext } from '@spectastic/core';

function stubFs(initial: Record<string, string>): {
  fs: FileSystem;
  files: Map<string, string>;
  renames: Array<[string, string]>;
  mkdirs: string[];
  ops: string[];
} {
  const files = new Map(Object.entries(initial));
  const renames: Array<[string, string]> = [];
  const mkdirs: string[] = [];
  const ops: string[] = []; // ordered op log, for asserting mkdir-before-rename (T-007)
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
      ops.push(`rename:${to}`);
      renames.push([from, to]);
      files.set(to, files.get(from) ?? '');
      files.delete(from);
    },
    async rm(path) {
      files.delete(path);
    },
    async mkdir(path) {
      ops.push(`mkdir:${path}`);
      mkdirs.push(path);
    },
  };
  return { fs, files, renames, mkdirs, ops };
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

  // T-201 (REQ-CHANGE-008): kernel completeness — proposal status flip + author summary.
  const PROPOSAL_WITH_STATUS = `<!doctype html><html><body>
<spec-change id="2026-06-16-foo" status="approved">
<span class="meta"><spec-status value="accepted">Approved</spec-status></span>
<spec-delta op="modified" target="FR-001"><spec-requirement id="FR-001" priority="must"><p>Updated.</p></spec-requirement></spec-delta>
<section id="changelog"><spec-changelog><ol></ol></spec-changelog></section>
</spec-change></body></html>`;

  it('apply mode: flips the proposal status to applied + records its apply entry', async () => {
    const { fs, files } = stubFs({
      '/specs/001/spec.html': LIVE_SPEC,
      '/specs/001/changes/2026-06-16-foo/proposal.html': PROPOSAL_WITH_STATUS,
    });
    await applyCommand({ kind: 'apply', specId: '001', slug: '2026-06-16-foo' }, { cwd: '', fs });
    // The kernel writes the flipped proposal to the proposal path before the archive rename.
    const proposal = files.get('/specs/001/changes/2026-06-16-foo/proposal.html');
    expect(proposal).toContain('status="applied"');
    expect(proposal).toContain('<spec-status value="applied">Applied</spec-status>');
    expect(proposal).not.toContain('value="accepted">Approved');
    expect(proposal).toContain('Applied on'); // the proposal's own apply changelog entry
  });

  it('apply mode: deepens the archived proposal\'s ../-relative paths one level (T-204)', async () => {
    const withPaths = PROPOSAL_WITH_STATUS.replace(
      '<body>',
      '<head><link rel="stylesheet" href="../../../../assets/spec.css"></head><body><a href="../../spec.html">spec</a>',
    );
    const { fs, files } = stubFs({
      '/specs/001/spec.html': LIVE_SPEC,
      '/specs/001/changes/2026-06-16-foo/proposal.html': withPaths,
    });
    await applyCommand({ kind: 'apply', specId: '001', slug: '2026-06-16-foo' }, { cwd: '', fs });
    const proposal = files.get('/specs/001/changes/2026-06-16-foo/proposal.html');
    expect(proposal).toContain('href="../../../../../assets/spec.css"'); // 4-up → 5-up
    expect(proposal).toContain('href="../../../spec.html"'); // 2-up → 3-up
  });

  it('apply mode: uses the author-supplied summary in the live-spec changelog', async () => {
    const { fs, files } = stubFs({
      '/specs/001/spec.html': LIVE_SPEC,
      '/specs/001/changes/2026-06-16-foo/proposal.html': APPLY_PROPOSAL,
    });
    await applyCommand(
      { kind: 'apply', specId: '001', slug: '2026-06-16-foo', summary: 'added FR-002, a rich human summary' },
      { cwd: '', fs },
    );
    const updated = files.get('/specs/001/spec.html')!;
    expect(updated).toContain('added FR-002, a rich human summary');
    expect(updated).not.toContain('1 delta (1 successful)');
  });

  it('apply mode: falls back to a terse delta count when no summary is given', async () => {
    const { fs, files } = stubFs({
      '/specs/001/spec.html': LIVE_SPEC,
      '/specs/001/changes/2026-06-16-foo/proposal.html': APPLY_PROPOSAL,
    });
    await applyCommand({ kind: 'apply', specId: '001', slug: '2026-06-16-foo' }, { cwd: '', fs });
    expect(files.get('/specs/001/spec.html')).toContain('1 delta (1 successful)');
  });

  // T-302 (REQ-CHANGE-007 / triage T-007): the move creates its parent dir before
  // the rename, so a spec's first apply/withdraw doesn't ENOENT on a missing dir.
  it('apply mode: mkdirs changes/archive/ before the rename (first-archive, T-007)', async () => {
    const { fs, mkdirs, ops } = stubFs({
      '/specs/001/spec.html': LIVE_SPEC,
      '/specs/001/changes/2026-06-16-foo/proposal.html': APPLY_PROPOSAL,
    });
    await applyCommand({ kind: 'apply', specId: '001', slug: '2026-06-16-foo' }, { cwd: '', fs });
    expect(mkdirs).toContain('/specs/001/changes/archive');
    // mkdir MUST precede the rename, or fs.rename ENOENTs on the missing parent.
    expect(ops.indexOf('mkdir:/specs/001/changes/archive')).toBeLessThan(
      ops.indexOf('rename:/specs/001/changes/archive/2026-06-16-foo'),
    );
  });

  it('withdraw mode: mkdirs changes/withdrawn/ before the rename (T-007)', async () => {
    const { fs, mkdirs, ops } = stubFs({
      '/specs/001/spec.html': LIVE_SPEC,
      '/specs/001/changes/2026-06-16-foo/proposal.html': APPLY_PROPOSAL,
    });
    await applyCommand(
      { kind: 'withdraw', specId: '001', slug: '2026-06-16-foo', reason: 'shape was wrong' },
      { cwd: '', fs },
    );
    expect(mkdirs).toContain('/specs/001/changes/withdrawn');
    expect(ops.indexOf('mkdir:/specs/001/changes/withdrawn')).toBeLessThan(
      ops.indexOf('rename:/specs/001/changes/withdrawn/2026-06-16-foo'),
    );
  });
});
