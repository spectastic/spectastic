import type { FileSystem } from '@spectastic/core';
import { GraduateError, graduateTransaction } from '@spectastic/core/commands/graduate';
import { describe, expect, it } from 'vitest';

// T-300 / T-301 (spec 023-explore-graduation, US3): the pure, atomic graduation
// transaction kernel — write spec+plan, archive + deepen, flip the marker last —
// and its all-or-nothing rollback (SC-003 / NFR-001).

/**
 * A dir-aware Map stub: `rename`/`rm` operate on whole subtrees (every key under
 * the path), since an exploration dir holds several files. `failOn` injects a
 * mid-step failure to exercise rollback. `ops` is an ordered call log.
 */
function stubFs(
  initial: Record<string, string>,
  opts: { failOn?: (op: string, path: string) => boolean } = {},
): { fs: FileSystem; files: Map<string, string>; ops: string[] } {
  const files = new Map(Object.entries(initial));
  const ops: string[] = [];
  const trip = (op: string, path: string): void => {
    if (opts.failOn?.(op, path)) throw new Error(`injected ${op} failure at ${path}`);
  };
  const fs: FileSystem = {
    async readFile(path) {
      const c = files.get(path);
      if (c === undefined) throw new Error(`ENOENT: ${path}`);
      return c;
    },
    async writeFile(path, content) {
      ops.push(`write:${path}`);
      trip('write', path);
      files.set(path, content);
    },
    async readdir() {
      return [];
    },
    async stat(path) {
      return { isFile: files.has(path), isDirectory: false };
    },
    async rename(from, to) {
      ops.push(`rename:${from}->${to}`);
      trip('rename', to);
      for (const [k, v] of [...files]) {
        if (k === from || k.startsWith(`${from}/`)) {
          files.set(to + k.slice(from.length), v);
          files.delete(k);
        }
      }
    },
    async rm(path) {
      ops.push(`rm:${path}`);
      for (const k of [...files.keys()]) {
        if (k === path || k.startsWith(`${path}/`)) files.delete(k);
      }
    },
    async mkdir(path) {
      ops.push(`mkdir:${path}`);
      trip('mkdir', path);
    },
  };
  return { fs, files, ops };
}

const MARKER = JSON.stringify({
  id: '099',
  intent: 'x',
  status: 'quarantined',
  created: '2026-06-20',
});
const EXTRACT = { specHtml: '<spec>S</spec>', planHtml: '<plan>P</plan>' };

describe('graduateTransaction (US3)', () => {
  it('writes spec+plan, archives + deepens the ledger, flips the marker LAST', async () => {
    const { fs, files, ops } = stubFs({
      '/explorations/099/quarantine.json': MARKER,
      '/explorations/099/explore.html': '<link href="../../assets/spec.css">ledger',
      '/explorations/099/prototype.ts': 'build',
    });
    const res = await graduateTransaction(
      {
        specId: '099',
        classification: 'tracer-bullet',
        extract: EXTRACT,
        date: '2026-06-26',
      },
      { cwd: '', fs },
    );

    // bundle written (spec + plan, no tasks — restore split to the sibling)
    expect(files.get('/specs/099/spec.html')).toBe('<spec>S</spec>');
    expect(files.get('/specs/099/design.html')).toBe('<plan>P</plan>');
    // exploration moved to archive/
    expect(files.has('/explorations/099/quarantine.json')).toBe(false);
    expect(files.has('/explorations/archive/099/prototype.ts')).toBe(true);
    // marker flipped + classify/graduated stamped, frozen in the archive
    const m = JSON.parse(files.get('/explorations/archive/099/quarantine.json') ?? '{}');
    expect(m.status).toBe('graduated');
    expect(m.classify).toBe('tracer-bullet');
    expect(m.graduated).toBe('2026-06-26');
    // archived ledger paths deepened one level (../../ → ../../../)
    expect(files.get('/explorations/archive/099/explore.html')).toContain('../../../assets/spec.css');
    // the marker flip is the LAST write — the point of no return
    expect(ops[ops.length - 1]).toBe('write:/explorations/archive/099/quarantine.json');
    expect(res.archivedPath).toBe('/explorations/archive/099');
    expect(res.classification).toBe('tracer-bullet');
  });

  it('rolls back on a mid-step failure: marker stays quarantined, no specs/<id>/ (SC-003)', async () => {
    const { fs, files } = stubFs(
      {
        '/explorations/099/quarantine.json': MARKER,
        '/explorations/099/explore.html': 'ledger',
      },
      // fail at the ledger-deepen write — after the bundle write + the archive move,
      // before the marker flip.
      { failOn: (op, path) => op === 'write' && path.endsWith('explore.html') },
    );

    await expect(
      graduateTransaction(
        {
          specId: '099',
          classification: 'spike',
          extract: EXTRACT,
          date: '2026-06-26',
        },
        { cwd: '', fs },
      ),
    ).rejects.toThrow(/injected/);

    // SC-003 invariant: the exploration is exactly as it was, ready to retry.
    expect(files.has('/specs/099/spec.html')).toBe(false); // partial bundle removed
    expect(files.has('/explorations/archive/099/quarantine.json')).toBe(false); // un-archived
    const m = JSON.parse(files.get('/explorations/099/quarantine.json') ?? '{}');
    expect(m.status).toBe('quarantined'); // never flipped
  });

  it('refuses if specs/<id>/ already exists', async () => {
    const { fs } = stubFs({
      '/explorations/099/quarantine.json': MARKER,
      '/specs/099/spec.html': '<existing/>',
    });
    await expect(
      graduateTransaction(
        {
          specId: '099',
          classification: 'spike',
          extract: EXTRACT,
          date: '2026-06-26',
        },
        { cwd: '', fs },
      ),
    ).rejects.toThrow(GraduateError);
  });

  it('refuses a non-quarantined (already graduated) exploration', async () => {
    const { fs } = stubFs({
      '/explorations/099/quarantine.json': JSON.stringify({
        id: '099',
        status: 'graduated',
      }),
    });
    await expect(
      graduateTransaction(
        {
          specId: '099',
          classification: 'spike',
          extract: EXTRACT,
          date: '2026-06-26',
        },
        { cwd: '', fs },
      ),
    ).rejects.toThrow(/not quarantined/);
  });
});
