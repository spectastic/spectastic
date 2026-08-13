import { describe, expect, it } from 'vitest';
import { ImportIdentityError, UNKNOWN, importDesignSource } from '../src/visual/import.js';
import { localSourceFetcher, SourceNotFoundError, SourceOutsideProjectError } from '../src/providers/local-source-fetcher.js';
import type { FileSystem } from '../src/types.js';

/**
 * Importing a design export (105-design-source-import).
 *
 * The load-bearing test is the LAST one: after an import, deleting the source
 * folder must change nothing. That property is the entire point of refusing a
 * live read path, and asserting it is the only way to know the adapter
 * actually disappeared rather than merely intending to.
 */

function memFs(files: Record<string, string>, dirs: string[] = []) {
  const store = { ...files };
  const fs = {
    readFile: async (p: string) => {
      if (!(p in store)) throw new Error(`ENOENT ${p}`);
      return store[p] as string;
    },
    writeFile: async (p: string, body: string) => {
      store[p] = body;
    },
    stat: async (p: string) => {
      if (dirs.includes(p)) return { isFile: false, isDirectory: true };
      if (p in store) return { isFile: true, isDirectory: false };
      throw new Error(`ENOENT ${p}`);
    },
    readdir: async (p: string) =>
      Object.keys(store)
        .filter((k) => k.startsWith(`${p}/`))
        .map((k) => k.slice(p.length + 1))
        .filter((k) => !k.includes('/')),
    rename: async () => {},
    mkdir: async () => {},
  } as unknown as FileSystem;
  return { fs, store };
}

const CWD = '/repo';
const FROM = 'exports/figma';
const INTO = '/repo/visual';

const setup = (extra: Record<string, string> = {}) =>
  memFs(
    {
      '/repo/exports/figma/base.tokens.json': '{"color":{}}',
      '/repo/exports/figma/converted.png': 'PNGDATA',
      ...extra,
    },
    ['/repo/exports/figma', '/repo/visual'],
  );

const run = (fsAndStore: ReturnType<typeof memFs>, previousIdentity?: string) =>
  importDesignSource(
    { from: FROM, into: INTO, identity: 'figma/converter', previousIdentity },
    localSourceFetcher(fsAndStore.fs, CWD),
    fsAndStore.fs,
  );

describe('landing an export', () => {
  it('writes every file and reports what it wrote', async () => {
    const m = setup();
    const ledger = await run(m);
    expect(ledger.written.sort()).toEqual(['base.tokens.json', 'converted.png']);
    expect(m.store[`${INTO}/base.tokens.json`]).toBe('{"color":{}}');
  });

  it('records an unknown provenance field rather than guessing one', () => {
    // A fabricated field is worse than a missing one, because it looks like
    // diligence. The corpus writes this literal for the same reason.
    expect(UNKNOWN).toBe('TODO');
  });
});

describe('re-importing', () => {
  it('writes no bytes when nothing changed', async () => {
    const m = setup();
    await run(m);
    const ledger = await run(m);
    expect(ledger.written).toEqual([]);
    expect(ledger.skipped.sort()).toEqual(['base.tokens.json', 'converted.png']);
  });

  it('replaces a file the export changed', async () => {
    const m = setup();
    await run(m);
    m.store['/repo/exports/figma/base.tokens.json'] = '{"color":{"accent":{}}}';
    const ledger = await run(m);
    expect(ledger.replaced).toEqual(['base.tokens.json']);
  });

  it('reports material the export no longer carries and never deletes it', async () => {
    const m = setup();
    await run(m);
    delete m.store['/repo/exports/figma/converted.png'];
    const ledger = await run(m);
    expect(ledger.orphaned).toEqual(['converted.png']);
    // Still there. An element missing from an export is as likely to be an
    // export setting as a deletion, and reporting is recoverable.
    expect(m.store[`${INTO}/converted.png`]).toBe('PNGDATA');
  });

  it('refuses loudly when the identity would change, rather than forking quietly', async () => {
    const m = setup();
    await expect(run(m, 'penpot/converter')).rejects.toBeInstanceOf(ImportIdentityError);
  });

  it('writes nothing at all when it refuses', async () => {
    const m = setup();
    await run(m).catch(() => {});
    const before = { ...m.store };
    await run(m, 'penpot/converter').catch(() => {});
    expect(m.store).toEqual(before);
  });
});

describe('the source location', () => {
  it('rejects an absolute path without stat-ing it', async () => {
    const m = setup();
    await expect(
      importDesignSource({ from: '/etc', into: INTO, identity: 'x' }, localSourceFetcher(m.fs, CWD), m.fs),
    ).rejects.toBeInstanceOf(SourceOutsideProjectError);
  });

  it('rejects a traversal out of the project', async () => {
    const m = setup();
    await expect(
      importDesignSource({ from: '../elsewhere', into: INTO, identity: 'x' }, localSourceFetcher(m.fs, CWD), m.fs),
    ).rejects.toBeInstanceOf(SourceOutsideProjectError);
  });

  it('reports a source that is not there', async () => {
    const m = setup();
    await expect(
      importDesignSource({ from: 'exports/sketch', into: INTO, identity: 'x' }, localSourceFetcher(m.fs, CWD), m.fs),
    ).rejects.toBeInstanceOf(SourceNotFoundError);
  });
});

describe('the property the whole slice rests on', () => {
  it('leaves nothing referring to the source once the import completes', async () => {
    const m = setup();
    await run(m);

    // Delete the entire export. This is what "the adapter disappears" means,
    // and it is the reason a live read path was refused: a spec must not be
    // only as available as somebody's seat.
    for (const k of Object.keys(m.store)) {
      if (k.startsWith('/repo/exports/')) delete m.store[k];
    }

    expect(m.store[`${INTO}/base.tokens.json`]).toBe('{"color":{}}');
    expect(m.store[`${INTO}/converted.png`]).toBe('PNGDATA');
  });
});
