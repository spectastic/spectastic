import { describe, expect, it, vi } from 'vitest';
import { writeBrief } from '../src/visual/brief-write.js';
import type { FileSystem } from '../src/types.js';

/**
 * The dated write (107-visual-design-brief, T-300, FR-009, design D-001/D-002).
 *
 * A brief is written once and never rewritten. FR-009's own wording is
 * silent on a same-day re-run, which NFR-002's byte-determinism makes an
 * edge case worth naming: this refuses rather than silently overwrites an
 * existing file at the computed path — the same discipline 106 FR-007 uses
 * for a naming collision (tasks.html's own changelog records this as a
 * task-authoring-time decision).
 */

function stubFs(overrides: Partial<FileSystem> = {}): FileSystem & {
  writeFile: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
} {
  const writeFile = vi.fn(async () => {});
  const mkdir = vi.fn(async () => {});
  return {
    readFile: async () => {
      throw new Error('unused in this test');
    },
    writeFile,
    readdir: async () => [],
    stat: async () => {
      throw new Error('ENOENT: unused in this test');
    },
    rename: async () => {},
    rm: async () => {},
    mkdir,
    readBinary: async () => {
      throw new Error('unused in this test');
    },
    writeBinary: async () => {
      throw new Error('unused in this test');
    },
    ...overrides,
  };
}

describe('writeBrief (107 FR-009)', () => {
  it('writes the content to the dated path under the owning spec', async () => {
    const fs = stubFs();
    const result = await writeBrief(
      { specId: '001-example', date: '2026-08-19', content: '# brief\n' },
      fs,
      '/project',
    );

    expect(result.path).toBe('specs/001-example/visual/briefs/2026-08-19.md');
    expect(fs.writeFile).toHaveBeenCalledWith('/project/specs/001-example/visual/briefs/2026-08-19.md', '# brief\n');
  });

  it('a later run with a different date leaves the earlier file untouched — different paths, no overwrite possible', async () => {
    const fs = stubFs();
    await writeBrief({ specId: '001-example', date: '2026-08-19', content: 'first\n' }, fs, '/project');
    await writeBrief({ specId: '001-example', date: '2026-09-01', content: 'second\n' }, fs, '/project');

    expect(fs.writeFile).toHaveBeenCalledTimes(2);
    const paths = fs.writeFile.mock.calls.map((c) => c[0]);
    expect(new Set(paths).size).toBe(2);
  });

  it('refuses rather than silently overwrites when a file already exists at the computed path', async () => {
    const fs = stubFs({
      stat: async () => ({ isDirectory: false }),
    });

    await expect(
      writeBrief({ specId: '001-example', date: '2026-08-19', content: 'new\n' }, fs, '/project'),
    ).rejects.toThrow(/exists|rewritten/i);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});
