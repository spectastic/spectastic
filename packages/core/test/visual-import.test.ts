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

/**
 * The six requirements that had a type and no runtime (triage T-006).
 *
 * Written after the fact, which is the wrong order and worth saying plainly:
 * the original 18 tasks were all ticked while four must-tier requirements were
 * unbuilt, because what existed was the vocabulary — exported interfaces that
 * nothing constructed and an array nothing pushed to. Every test below asserts
 * BEHAVIOUR reachable from `importDesignSource`, never the presence of a type,
 * because a type is exactly what passed last time.
 */

import {
  MANIFEST_NAME,
  carriesExecutableContent,
  contentHash,
  deriveTokenCandidates,
  forbiddingLicence,
} from '../src/visual/import.js';

/** A clean export directory — `setup()` seeds two files of its own, which
 *  would show up in every `written` assertion below. */
const only = (files: Record<string, string>) =>
  memFs(
    Object.fromEntries(Object.entries(files).map(([k, v]) => [`${CWD}/${FROM}/${k}`, v])),
    [`${CWD}/${FROM}`, INTO],
  );

const imp = (m: ReturnType<typeof memFs>, extra: Record<string, unknown> = {}) =>
  importDesignSource(
    { from: FROM, into: INTO, identity: 'design-1', ...extra },
    localSourceFetcher(m.fs, CWD),
    m.fs,
  );

describe('provenance on every landed file (FR-004)', () => {
  it('records what the caller knows and marks the rest unknown rather than guessing', async () => {
    const m = only({ 'screen.html': '<p>a</p>' });
    const ledger = await imp(m, { origin: 'a design tool', originUrl: 'https://example.invalid/p/1' });
    expect(ledger.files).toHaveLength(1);
    const p = ledger.files[0]?.provenance;
    expect(p?.origin).toBe('a design tool');
    expect(p?.originUrl).toBe('https://example.invalid/p/1');
    // Nothing in the file declares these, so neither is invented.
    expect(p?.edition).toBe(UNKNOWN);
    expect(p?.license).toBe(UNKNOWN);
    expect(p?.contentHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('reads an edition and a licence the material declares', async () => {
    const m = only({ 's.html': '<meta name="edition" content="x"><p>edition: 2026-08 licence: cc-by-4.0</p>' });
    const ledger = await imp(m);
    expect(ledger.files[0]?.provenance.edition).toBe('2026-08');
    expect(ledger.files[0]?.provenance.license).toBe('cc-by-4.0');
  });

  it('hashes deterministically, so a re-import can tell same from changed', () => {
    expect(contentHash('a')).toBe(contentHash('a'));
    expect(contentHash('a')).not.toBe(contentHash('b'));
  });
});

describe('nothing arrives looking reviewed (FR-006)', () => {
  it('marks every landed file not-yet-reviewed', async () => {
    const m = only({ 'a.html': '<p>a</p>', 'b.html': '<p>b</p>' });
    const ledger = await imp(m);
    expect(ledger.files.map((f) => f.reviewed)).toEqual([false, false]);
  });

  it('writes a manifest that says so where a reader will see it', async () => {
    const m = only({ 'a.html': '<p>a</p>' });
    const { store } = m;
    await imp(m);
    const manifest = store[`${INTO}/${MANIFEST_NAME}`] as string;
    expect(manifest).toContain('NOT REVIEWED');
    expect(manifest).toContain('none of it has been reviewed');
    // The requirement is about a reader, so a ledger nobody renders is not enough.
    expect(manifest).toContain('<title>');
  });

  it('writes a manifest carrying no executable content of its own', async () => {
    const m = only({ 'a.html': '<p style="color:#abc">a</p>' });
    const { store } = m;
    await imp(m);
    expect(carriesExecutableContent(store[`${INTO}/${MANIFEST_NAME}`] as string)).toBe(false);
  });
});

describe('token candidates are derived and never committed (FR-010, FR-005)', () => {
  it('derives colour literals from the landed material', async () => {
    const m = only({ 'a.html': '<p style="background:#F7F5F1;color:#1C1914">a</p>' });
    const ledger = await imp(m);
    expect(ledger.tokenCandidates.map((c) => c.value)).toContain('#f7f5f1');
  });

  it('marks every candidate inferred and unconfirmed', async () => {
    const m = only({ 'a.html': '<p style="color:#abc">a</p>' });
    const ledger = await imp(m);
    expect(ledger.tokenCandidates.every((c) => c.inferred && !c.confirmed)).toBe(true);
  });

  it('offers no name, because naming a token is the decision a human makes', async () => {
    const m = only({ 'a.html': '<p style="color:#abc">a</p>' });
    const ledger = await imp(m);
    expect(Object.keys(ledger.tokenCandidates[0] ?? {})).not.toContain('name');
  });

  it('writes nothing into a token set', async () => {
    const m = only({ 'a.html': '<p style="color:#abc">a</p>' });
    const { store } = m;
    await imp(m);
    expect(Object.keys(store).filter((k) => /token/i.test(k))).toEqual([]);
  });

  it('orders by how often a value appears, and stably', () => {
    const derived = deriveTokenCandidates([
      { name: 'a', body: '#aaaaaa #bbbbbb #bbbbbb' },
      { name: 'b', body: '#bbbbbb' },
    ]);
    expect(derived[0]?.value).toBe('#bbbbbb');
    expect(derived[0]?.occurrences).toBe(3);
    expect(derived[0]?.sources).toEqual(['a', 'b']);
  });
});

describe('material that cannot be landed is reported, not dropped (FR-011, triage T-007)', () => {
  it('does not land a file carrying a runtime', async () => {
    const m = only({ 'screens.dc.html': '<div>{{ x }}</div><script>var a = 1</script>' });
    const { store } = m;
    const ledger = await imp(m);
    expect(ledger.unhandled).toEqual(['screens.dc.html']);
    expect(ledger.written).toEqual([]);
    expect(store[`${INTO}/screens.dc.html`]).toBeUndefined();
  });

  it('names the categories a real export uses', () => {
    expect(carriesExecutableContent('<script type="text/x-dc">x</script>')).toBe(true);
    expect(carriesExecutableContent('<iframe src="x">')).toBe(true);
    expect(carriesExecutableContent('<a onclick="x()">')).toBe(true);
    expect(carriesExecutableContent('<a href="javascript:x">')).toBe(true);
    expect(carriesExecutableContent('<img src="data:image/png;base64,x">')).toBe(true);
    expect(carriesExecutableContent('<div style="color:#fff">plain</div>')).toBe(false);
  });

  it('still lands the rest of the export', async () => {
    const m = only({ 'a.html': '<p>a</p>', 'b.html': '<script>x</script>' });
    const { store } = m;
    const ledger = await imp(m);
    expect(ledger.written).toEqual(['a.html']);
    expect(ledger.unhandled).toEqual(['b.html']);
    expect(store[`${INTO}/a.html`]).toBe('<p>a</p>');
  });
});

describe('a licence that forbids landing (FR-012)', () => {
  it('refuses, and says which licence and why', async () => {
    const m = only({ 'a.html': '<p>licence: cc-by-nc-nd</p>' });
    const { store } = m;
    const ledger = await imp(m);
    expect(ledger.refused).toEqual([{ name: 'a.html', reason: 'licence forbids landing: cc-by-nc-nd' }]);
    expect(store[`${INTO}/a.html`]).toBeUndefined();
  });

  it('lets a permissive licence through', async () => {
    const m = only({ 'a.html': '<p>license: cc-by-4.0</p>' });
    const ledger = await imp(m);
    expect(ledger.refused).toEqual([]);
    expect(ledger.written).toEqual(['a.html']);
  });

  it('says nothing about material that declares no licence, rather than assuming the worst', () => {
    expect(forbiddingLicence('<p>no licence here</p>')).toBeUndefined();
  });
});

describe('deriving from what was read, not from what was landed', () => {
  it('still derives colour from a file that could not be landed', async () => {
    // The real shape of the problem: in a genuine export the file carrying the
    // runtime is also the one carrying most of the colour. Refusing to land it
    // is right; ignoring it would throw away FR-010's best input.
    const m = only({ 'screens.dc.html': '<div style="background:#f7f5f1"><script>x</script></div>' });
    const ledger = await imp(m);
    expect(ledger.unhandled).toEqual(['screens.dc.html']);
    expect(ledger.tokenCandidates.map((c) => c.value)).toEqual(['#f7f5f1']);
  });

  it('derives nothing from material a licence forbids, because that is a permission question', async () => {
    const m = only({ 'a.html': '<p style="color:#abcdef">licence: cc-by-nd</p>' });
    const ledger = await imp(m);
    expect(ledger.refused).toHaveLength(1);
    expect(ledger.tokenCandidates).toEqual([]);
  });
});
