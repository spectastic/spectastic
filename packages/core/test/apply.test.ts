import type { FileSystem, KernelContext } from '@spectastic/core';
import { applyCommand } from '@spectastic/core/commands/apply';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  // A single-digit day (caught applying 2026-08-01-widen-interface-detection):
  // a bare Number() on the split ISO date strips a leading zero, so every
  // prior apply happened to land past the 10th to ever surface it.
  describe('changelog date text is zero-padded (formatHumanDate)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('renders a single-digit day as "01 Aug 2026", not "1 Aug 2026"', async () => {
      vi.setSystemTime(new Date('2026-08-01T12:00:00Z'));
      const { fs, files } = stubFs({
        '/specs/001/spec.html': LIVE_SPEC,
        '/specs/001/changes/2026-06-16-foo/proposal.html': APPLY_PROPOSAL,
      });
      const ctx: KernelContext = { cwd: '', fs };

      await applyCommand({ kind: 'apply', specId: '001', slug: '2026-06-16-foo' }, ctx);

      const updated = files.get('/specs/001/spec.html')!;
      expect(updated).toContain('01 Aug 2026');
      expect(updated).not.toContain('>1 Aug 2026<');
    });
  });

  it('apply mode: folds delta into live spec + archives folder', async () => {
    const { fs, files, renames } = stubFs({
      '/specs/001/spec.html': LIVE_SPEC,
      '/specs/001/changes/2026-06-16-foo/proposal.html': APPLY_PROPOSAL,
    });
    const ctx: KernelContext = { cwd: '', fs };

    const result = await applyCommand({ kind: 'apply', specId: '001', slug: '2026-06-16-foo' }, ctx);

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
      {
        kind: 'withdraw',
        specId: '001',
        slug: '2026-06-16-foo',
        reason: 'shape was wrong',
      },
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

  it("apply mode: deepens the archived proposal's ../-relative paths one level (T-204)", async () => {
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
      {
        kind: 'apply',
        specId: '001',
        slug: '2026-06-16-foo',
        summary: 'added FR-002, a rich human summary',
      },
      { cwd: '', fs },
    );
    const updated = files.get('/specs/001/spec.html')!;
    expect(updated).toContain('added FR-002, a rich human summary');
    expect(updated).not.toContain('1 delta (1 successful)');
  });

  it('apply mode: never double-periods a summary that already ends a sentence (just-do)', async () => {
    const { fs, files } = stubFs({
      '/specs/001/spec.html': LIVE_SPEC,
      '/specs/001/changes/2026-06-16-foo/proposal.html': APPLY_PROPOSAL,
    });
    await applyCommand(
      {
        kind: 'apply',
        specId: '001',
        slug: '2026-06-16-foo',
        summary: 'added FR-002, a rich human summary.',
      },
      { cwd: '', fs },
    );
    const updated = files.get('/specs/001/spec.html')!;
    expect(updated).toContain('added FR-002, a rich human summary.</span>');
    expect(updated).not.toContain('summary..');
  });

  it('apply mode: falls back to a terse delta count when no summary is given', async () => {
    const { fs, files } = stubFs({
      '/specs/001/spec.html': LIVE_SPEC,
      '/specs/001/changes/2026-06-16-foo/proposal.html': APPLY_PROPOSAL,
    });
    await applyCommand({ kind: 'apply', specId: '001', slug: '2026-06-16-foo' }, { cwd: '', fs });
    expect(files.get('/specs/001/spec.html')).toContain('1 delta (1 successful)');
  });

  // T-1102 (REQ-CHANGE-002 / REQ-CHANGE-008 / triage T-018): a data/content delta —
  // a target naming manifest data (not a requirement ID), no embedded <spec-requirement> —
  // leaves the requirements body unchanged (no fabricated requirement) while the changelog
  // append + archive still run. A requirement-shaped target with no post-state gate-blocks.
  const DATA_PROPOSAL = `<!doctype html><html><body>
<spec-change id="2026-07-11-data" status="approved">
<spec-delta op="added" target="standard/foo">
  <spec-diff>+ contract-first interfaces</spec-diff>
</spec-delta>
<section id="changelog"><spec-changelog><ol></ol></spec-changelog></section>
</spec-change></body></html>`;

  const MALFORMED_REQ_PROPOSAL = `<!doctype html><html><body>
<spec-change id="2026-07-11-oops" status="approved">
<spec-delta op="added" target="FR-999"><spec-diff>+ forgot the spec-requirement</spec-diff></spec-delta>
<section id="changelog"><spec-changelog><ol></ol></spec-changelog></section>
</spec-change></body></html>`;

  it('apply mode: a data/content delta leaves the requirements body unchanged (T-018)', async () => {
    const { fs, files, renames } = stubFs({
      '/specs/001/spec.html': LIVE_SPEC,
      '/specs/001/changes/2026-07-11-data/proposal.html': DATA_PROPOSAL,
    });
    const result = await applyCommand(
      {
        kind: 'apply',
        specId: '001',
        slug: '2026-07-11-data',
        summary: 'seed a manifest principle',
      },
      { cwd: '', fs },
    );

    expect(result.deltas).toHaveLength(1);
    expect(result.deltas[0]?.result).toBe('success');
    expect(result.deltas[0]?.reason).toMatch(/data\/content/);
    const updated = files.get('/specs/001/spec.html')!;
    // No fabricated requirement, and the delta prose never reaches the requirements body.
    expect(updated).not.toContain('id="standard/foo"');
    expect(updated).not.toContain('contract-first interfaces');
    expect(updated).toContain('<p>Original.</p>'); // FR-001 body untouched
    // The changelog append still lands (every apply writes it), and archive still runs.
    expect(updated).toContain('seed a manifest principle');
    expect(renames[0]?.[1]).toBe('/specs/001/changes/archive/2026-07-11-data');
  });

  it('apply mode: a requirement-shaped target with no embedded requirement gate-blocks (T-018 guard)', async () => {
    const { fs, files } = stubFs({
      '/specs/001/spec.html': LIVE_SPEC,
      '/specs/001/changes/2026-07-11-oops/proposal.html': MALFORMED_REQ_PROPOSAL,
    });
    const result = await applyCommand({ kind: 'apply', specId: '001', slug: '2026-07-11-oops' }, { cwd: '', fs });
    expect(result.deltas[0]?.result).toBe('gate-blocked');
    expect(result.deltas[0]?.reason).toMatch(/missing <spec-requirement>/);
    // Never fabricates FR-999 into the spec.
    expect(files.get('/specs/001/spec.html')).not.toContain('id="FR-999"');
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
      {
        kind: 'withdraw',
        specId: '001',
        slug: '2026-06-16-foo',
        reason: 'shape was wrong',
      },
      { cwd: '', fs },
    );
    expect(mkdirs).toContain('/specs/001/changes/withdrawn');
    expect(ops.indexOf('mkdir:/specs/001/changes/withdrawn')).toBeLessThan(
      ops.indexOf('rename:/specs/001/changes/withdrawn/2026-06-16-foo'),
    );
  });

  // I-042: the changelog entry's machine datetime= and its visible human text must
  // always name the same calendar day. Self-consistency check (no clock mocking
  // needed) — a prior version computed the two from independent new Date() calls
  // (one UTC via toISOString, one local-time via getDate/getMonth/getFullYear),
  // which disagreed whenever the run straddled a UTC/local midnight boundary.
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function assertDatetimeMatchesText(entry: string): void {
    const m = /<time datetime="(\d{4})-(\d{2})-(\d{2})">(\d{1,2}) (\w{3}) (\d{4})<\/time>/.exec(entry);
    expect(m, `no <time> element found in: ${entry}`).not.toBeNull();
    const [, isoYear, isoMonth, isoDay, textDay, textMonth, textYear] = m!;
    expect(Number(textDay)).toBe(Number(isoDay));
    expect(MONTHS[Number(isoMonth) - 1]).toBe(textMonth);
    expect(textYear).toBe(isoYear);
  }

  it("apply mode: the live-spec changelog entry's datetime= agrees with its visible text", async () => {
    const { fs, files } = stubFs({
      '/specs/001/spec.html': LIVE_SPEC,
      '/specs/001/changes/2026-06-16-foo/proposal.html': APPLY_PROPOSAL,
    });
    await applyCommand({ kind: 'apply', specId: '001', slug: '2026-06-16-foo' }, { cwd: '', fs });
    const entry = /<li><time[\s\S]*?<\/li>/.exec(files.get('/specs/001/spec.html')!)?.[0] ?? '';
    assertDatetimeMatchesText(entry);
  });

  it("apply mode: the archived proposal's own apply entry datetime= agrees with its visible text", async () => {
    const { fs, files } = stubFs({
      '/specs/001/spec.html': LIVE_SPEC,
      '/specs/001/changes/2026-06-16-foo/proposal.html': PROPOSAL_WITH_STATUS,
    });
    await applyCommand({ kind: 'apply', specId: '001', slug: '2026-06-16-foo' }, { cwd: '', fs });
    const proposal = files.get('/specs/001/changes/2026-06-16-foo/proposal.html')!;
    const entry = /<li><time[\s\S]*?Applied on[\s\S]*?<\/li>/.exec(proposal)?.[0] ?? '';
    assertDatetimeMatchesText(entry);
  });

  it('withdraw mode: the "Considered…withdrew" changelog entry\'s datetime= agrees with its visible text', async () => {
    const { fs, files } = stubFs({
      '/specs/001/spec.html': LIVE_SPEC,
      '/specs/001/changes/2026-06-16-foo/proposal.html': APPLY_PROPOSAL,
    });
    await applyCommand(
      {
        kind: 'withdraw',
        specId: '001',
        slug: '2026-06-16-foo',
        reason: 'shape was wrong',
      },
      { cwd: '', fs },
    );
    const entry = /<li><time[\s\S]*?<\/li>/.exec(files.get('/specs/001/spec.html')!)?.[0] ?? '';
    assertDatetimeMatchesText(entry);
  });
});
