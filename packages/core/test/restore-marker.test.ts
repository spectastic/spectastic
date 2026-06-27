import { describe, expect, it } from 'vitest';
import { readArchivedClassify } from '@spectastic/core/commands/restore-marker';
import type { FileSystem } from '@spectastic/core';

// T-012 (spec 024-explore-restore, FR-004): read the frozen classify from a
// graduated exploration's archived marker; null for anything not graduated.

function stubFs(files: Record<string, string>): FileSystem {
  return {
    async readFile(p) {
      const c = files[p];
      if (c === undefined) throw new Error(`ENOENT: ${p}`);
      return c;
    },
    async writeFile() {},
    async readdir() {
      return [];
    },
    async stat(p) {
      return { isFile: p in files, isDirectory: false };
    },
    async rename() {},
    async rm() {},
    async mkdir() {},
  };
}

describe('readArchivedClassify (024-explore-restore, FR-004)', () => {
  const cwd = '/proj';
  const markerPath = `${cwd}/explorations/archive/019-x/quarantine.json`;

  it('returns the frozen classify for a graduated marker', async () => {
    const fs = stubFs({
      [markerPath]: JSON.stringify({ id: '019-x', status: 'graduated', classify: 'tracer-bullet' }),
    });
    expect(await readArchivedClassify(fs, cwd, '019-x')).toBe('tracer-bullet');
  });

  it('returns spike when the build was a spike', async () => {
    const fs = stubFs({ [markerPath]: JSON.stringify({ status: 'graduated', classify: 'spike' }) });
    expect(await readArchivedClassify(fs, cwd, '019-x')).toBe('spike');
  });

  it('returns null when there is no archived marker (not a graduated exploration)', async () => {
    expect(await readArchivedClassify(stubFs({}), cwd, '019-x')).toBeNull();
  });

  it('returns null when the marker has not flipped to graduated', async () => {
    const fs = stubFs({ [markerPath]: JSON.stringify({ status: 'quarantined' }) });
    expect(await readArchivedClassify(fs, cwd, '019-x')).toBeNull();
  });

  it('returns null on a corrupt marker rather than throwing', async () => {
    const fs = stubFs({ [markerPath]: '{ not json' });
    expect(await readArchivedClassify(fs, cwd, '019-x')).toBeNull();
  });
});
