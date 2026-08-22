import { describe, expect, it } from 'vitest';
import {
  type ConfirmCandidateInput,
  confirmTokenCandidate,
  declaredColourValues,
  deriveTokenCandidates,
  ImportIdentityError,
  isTokenFile,
  representColour,
  representSpacing,
  representToken,
  TokenConfirmationError,
  UNKNOWN,
  importDesignSource,
} from '../src/visual/import.js';
import {
  localSourceFetcher,
  SourceNotFoundError,
  SourceOutsideProjectError,
} from '../src/providers/local-source-fetcher.js';
import type { FileSystem } from '../src/types.js';

/**
 * Importing a design export (105-design-source-import).
 *
 * The load-bearing test is the LAST one: after an import, deleting the source
 * folder must change nothing. That property is the entire point of refusing a
 * live read path, and asserting it is the only way to know the adapter
 * actually disappeared rather than merely intending to.
 */

/**
 * An in-memory FileSystem that models DIRECTORIES.
 *
 * The previous version did not, and that is why three real defects shipped
 * (triage T-015, T-016, T-017): `writeFile` was `store[p] = body`, so writing
 * into a directory that does not exist was impossible to fail, and `readFile`
 * returned a string for any key, so reading a directory was impossible to fail
 * either. A stub simpler than the port it stands for cannot fail the way the
 * port fails, and every one of those defects was unrepresentable here while
 * passing 46 green tests.
 *
 * So this one refuses what the real filesystem refuses:
 *  - `readFile` on a directory throws EISDIR
 *  - `writeFile` under a missing parent throws ENOENT
 *  - `readdir` lists immediate children only, directories included
 */
function memFs(files: Record<string, string>, dirs: string[] = []) {
  const store = { ...files };
  const madeDirs = new Set<string>(dirs);
  // Every ancestor of a seeded file is a directory, as on a real filesystem.
  for (const f of Object.keys(files)) {
    const parts = f.split('/');
    for (let i = 1; i < parts.length; i++) madeDirs.add(parts.slice(0, i).join('/'));
  }
  for (const d of dirs) {
    const parts = d.split('/');
    for (let i = 1; i < parts.length; i++) madeDirs.add(parts.slice(0, i).join('/'));
  }

  const isDir = (p: string): boolean => madeDirs.has(p);

  const fs = {
    readFile: async (p: string) => {
      if (isDir(p)) {
        const e = new Error('EISDIR: illegal operation on a directory, read');
        (e as NodeJS.ErrnoException).code = 'EISDIR';
        throw e;
      }
      if (!(p in store)) throw new Error(`ENOENT ${p}`);
      return store[p] as string;
    },
    writeFile: async (p: string, body: string) => {
      const parent = p.slice(0, p.lastIndexOf('/'));
      if (parent && !isDir(parent)) {
        const e = new Error(`ENOENT: no such file or directory, open '${p}'`);
        (e as NodeJS.ErrnoException).code = 'ENOENT';
        throw e;
      }
      store[p] = body;
    },
    stat: async (p: string) => {
      if (isDir(p)) return { isFile: false, isDirectory: true };
      if (p in store) return { isFile: true, isDirectory: false };
      throw new Error(`ENOENT ${p}`);
    },
    readdir: async (p: string) => {
      const kids = new Set<string>();
      for (const k of [...Object.keys(store), ...madeDirs]) {
        if (!k.startsWith(`${p}/`)) continue;
        const rest = k.slice(p.length + 1);
        if (rest.length > 0) kids.add(rest.split('/')[0] as string);
      }
      return [...kids].sort();
    },
    rename: async () => {},
    mkdir: async (p: string) => {
      const parts = p.split('/');
      for (let i = 1; i <= parts.length; i++) madeDirs.add(parts.slice(0, i).join('/'));
    },
  } as unknown as FileSystem;
  return { fs, store, madeDirs };
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

import { MANIFEST_NAME, carriesExecutableContent, contentHash, forbiddingLicence } from '../src/visual/import.js';

/** A clean export directory — `setup()` seeds two files of its own, which
 *  would show up in every `written` assertion below. */
const only = (files: Record<string, string>) =>
  memFs(Object.fromEntries(Object.entries(files).map(([k, v]) => [`${CWD}/${FROM}/${k}`, v])), [
    `${CWD}/${FROM}`,
    INTO,
  ]);

const imp = (m: ReturnType<typeof memFs>, extra: Record<string, unknown> = {}) =>
  importDesignSource({ from: FROM, into: INTO, identity: 'design-1', ...extra }, localSourceFetcher(m.fs, CWD), m.fs);

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
    const enc = new TextEncoder();
    expect(contentHash(enc.encode('a'))).toBe(contentHash(enc.encode('a')));
    expect(contentHash(enc.encode('a'))).not.toBe(contentHash(enc.encode('b')));
  });
});

/**
 * A byte survives the port (106-visual-render, US2, FR-002, T-201).
 *
 * `contentHash` currently hashes `body.charCodeAt(i)` over a JS string, which
 * matches bytes only in the ASCII range — a `String` is UTF-16 code units,
 * not the bytes an import actually reads. The target contract (built by the
 * sibling task T-211, not this one) is `contentHash(bytes: Uint8Array)`: the
 * signature itself changes, so this test is written to fail to compile right
 * now rather than merely to fail at runtime.
 */
describe('the content hash is computed over bytes, not UTF-16 code units (FR-002, T-201)', () => {
  it('hashes two byte sequences differing only outside the text-representable range differently', () => {
    // Identical ASCII prefix, differing only in a trailing byte that has no
    // single-code-unit JS string representation on its own (0x80 vs 0xFF) —
    // exactly the case a UTF-16-based hash cannot distinguish.
    const a = Uint8Array.from([0x61, 0x62, 0x63, 0x80]);
    const b = Uint8Array.from([0x61, 0x62, 0x63, 0xff]);
    expect(contentHash(a)).not.toBe(contentHash(b));
  });

  it("keeps today's value for a pure-ASCII byte sequence", () => {
    const bytes = new TextEncoder().encode('hello world');
    // Grounded, not guessed: 'd58b3fa7' is the REAL output of the current
    // (string-based) contentHash('hello world') today, captured with:
    //   node -e "
    //     function contentHash(body) {
    //       let h = 0x811c9dc5;
    //       for (let i = 0; i < body.length; i++) {
    //         h ^= body.charCodeAt(i);
    //         h = Math.imul(h, 0x01000193) >>> 0;
    //       }
    //       return h.toString(16).padStart(8, '0');
    //     }
    //     console.log(contentHash('hello world'));
    //   "
    // A byte-based hash MUST reproduce this exact value for ASCII input — a
    // regression guard against a silent hash change for the common case.
    expect(contentHash(bytes)).toBe('d58b3fa7');
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
      { name: 'a', body: '#aaaaaa #bbbbbb #bbbbbb', landed: true },
      { name: 'b', body: '#bbbbbb', landed: true },
    ]);
    expect(derived[0]?.value).toBe('#bbbbbb');
    expect(derived[0]?.occurrences).toBe(3);
    expect(derived[0]?.sources).toEqual(['a', 'b']);
  });
});

// Widened by 2026-08-22-what-a-candidate-is-made-of (FR-010, triage T-021): a
// real export whose colours are entirely oklch() derived nothing under the
// hex-only pattern this replaces. One case per notation FR-010 names.
describe('colour derivation recognises every notation FR-010 names (FR-010, T-1700)', () => {
  it.each([
    ['rgb()', 'rgb(248 250 252)'],
    ['rgba()', 'rgba(0, 0, 0, 0.5)'],
    ['hsl()', 'hsl(217 91% 60%)'],
    ['hsla()', 'hsla(217, 91%, 60%, 0.5)'],
    ['hwb()', 'hwb(120 30% 40%)'],
    ['lab()', 'lab(29.2345% 39.3825 20.0664)'],
    ['lch()', 'lch(52.2% 72.2 50)'],
    ['oklab()', 'oklab(59.69% 0.1007 0.1191)'],
    ['oklch()', 'oklch(0.21 0.034 264.665)'],
    ['color()', 'color(display-p3 1 0.5 0)'],
  ])('derives a %s value', (_label, value) => {
    const derived = deriveTokenCandidates([{ name: 'a.html', body: `<div style="color:${value}">a</div>`, landed: true }]);
    expect(derived.map((c) => c.value)).toContain(value.toLowerCase());
  });

  it('still derives hex alongside a functional notation in the same file', () => {
    const body = '<div style="background:#0f172a;color:oklch(0.97 0 0)">a</div>';
    const derived = deriveTokenCandidates([{ name: 'a.html', body, landed: true }]);
    expect(derived.map((c) => c.value).sort()).toEqual(['#0f172a', 'oklch(0.97 0 0)']);
  });

  it('does not match a bare length or an unrelated identifier', () => {
    const body = '<div style="width:16px;font-family:color-sans">a</div>';
    const derived = deriveTokenCandidates([{ name: 'a.html', body, landed: true }]);
    expect(derived).toEqual([]);
  });
});

// T-1701: the kind travels with the candidate all the way to the manifest a
// reviewer actually reads, not just through deriveTokenCandidates' return type.
describe('a candidate carries its kind through to the manifest (FR-010, T-1701)', () => {
  it('shows the Kind column and a colour candidate\'s kind', async () => {
    const m = only({ 'a.html': '<p style="color:oklch(0.21 0.034 264.665)">a</p>' });
    const { store } = m;
    await imp(m);
    const manifest = store[`${INTO}/${MANIFEST_NAME}`] as string;
    expect(manifest).toContain('<th>Kind</th>');
    expect(manifest).toMatch(/<td>colour<\/td><td><code>oklch\(0\.21 0\.034 264\.665\)<\/code><\/td>/);
  });
});

// T-1702: spacing derivation, bounded to the property that declares it. A
// bare length pattern would match width/font-size/border-radius too, which
// is the flood FR-010's spacing clause exists to avoid.
describe('spacing derivation is bounded to a declaring spacing property (FR-010, T-1702)', () => {
  it('derives a length declared against padding, margin, gap and inset', () => {
    const body =
      '<div style="padding:8px;margin-top:1rem;gap:12px;inset:0;border-radius:4px;font-size:14px;width:200px">a</div>';
    const derived = deriveTokenCandidates([{ name: 'a.html', body, landed: true }]);
    expect(derived.map((c) => c.value).sort()).toEqual(['0', '12px', '1rem', '8px']);
    expect(derived.every((c) => c.kind === 'spacing')).toBe(true);
  });

  it('does not offer a length declared against width or font-size', () => {
    const body = '<div style="width:16px;font-size:16px;border-radius:16px">a</div>';
    const derived = deriveTokenCandidates([{ name: 'a.html', body, landed: true }]);
    expect(derived).toEqual([]);
  });

  it('derives a spacing longhand, physical and logical', () => {
    const body = '<div style="padding-inline-start:1.5rem;margin-block-end:2rem;row-gap:4px">a</div>';
    const derived = deriveTokenCandidates([{ name: 'a.html', body, landed: true }]);
    expect(derived.map((c) => c.value).sort()).toEqual(['1.5rem', '2rem', '4px']);
  });

  it('derives a length in em, which is derivable and separately refused at write time', () => {
    const derived = deriveTokenCandidates([{ name: 'a.html', body: '<div style="margin:1.25em">a</div>', landed: true }]);
    expect(derived.map((c) => c.value)).toEqual(['1.25em']);
  });

  it('derives from a <style> block rule, not only an inline style attribute', () => {
    const body = '<style>.card{ padding: 24px; }</style>';
    const derived = deriveTokenCandidates([{ name: 'a.html', body, landed: true }]);
    expect(derived.map((c) => c.value)).toEqual(['24px']);
  });

  it('merges the same length seen via two different spacing properties', () => {
    const body = '<div style="padding:8px"></div><div style="margin:8px"></div>';
    const derived = deriveTokenCandidates([{ name: 'a.html', body, landed: true }]);
    expect(derived).toHaveLength(1);
    expect(derived[0]?.occurrences).toBe(2);
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

describe('what the risk pass changed (FR-004 widened, FR-015 mitigated)', () => {
  it('records provenance for a file it read and did not land', async () => {
    const m = only({ 'screens.dc.html': '<div style="color:#abcdef"><script>x</script></div>' });
    const ledger = await imp(m, { origin: 'a design tool' });
    expect(ledger.unhandled).toEqual(['screens.dc.html']);
    // Recorded against the SOURCE name, because there is no destination — and
    // that absence is itself what a reader needs to know.
    expect(ledger.files).toHaveLength(1);
    expect(ledger.files[0]?.path).toBe('screens.dc.html');
    expect(ledger.files[0]?.provenance.origin).toBe('a design tool');
  });

  it('marks a candidate whose evidence was never landed', async () => {
    const m = only({ 'screens.dc.html': '<div style="color:#abcdef"><script>x</script></div>' });
    const ledger = await imp(m);
    expect(ledger.tokenCandidates[0]?.fromUnlanded).toBe(true);
  });

  it('does not mark one whose evidence is all in the project', async () => {
    const m = only({ 'palette.css': ':root{--a:#abcdef}' });
    const ledger = await imp(m);
    expect(ledger.tokenCandidates[0]?.fromUnlanded).toBe(false);
  });

  it('says so in the manifest, beside the source a reader would go looking for', async () => {
    const m = only({ 'screens.dc.html': '<div style="color:#abcdef"><script>x</script></div>' });
    const { store } = m;
    await imp(m);
    expect(store[`${INTO}/${MANIFEST_NAME}`]).toContain('not landed — see the export');
  });

  it('still records nothing at all for material a licence forbids', async () => {
    // The one case that excludes material from both reading and landing.
    const m = only({ 'a.html': '<p style="color:#abcdef">licence: cc-by-nd</p>' });
    const ledger = await imp(m);
    expect(ledger.files).toEqual([]);
    expect(ledger.tokenCandidates).toEqual([]);
  });
});

describe('prose about executable content is not executable content', () => {
  it('lands a README that merely mentions a script', async () => {
    // Found by running a real import over a zip: the export's own README
    // explained that it "carries a <script>", and was refused for saying so —
    // costing the reader the one file most likely to explain the export.
    const m = only({ 'README.md': 'The export carries a `<script>` to compute its values.' });
    const ledger = await imp(m);
    expect(ledger.unhandled).toEqual([]);
    expect(ledger.written).toEqual(['README.md']);
  });

  it('still refuses an SVG that really can carry one', async () => {
    const m = only({ 'icon.svg': '<svg><script>x</script></svg>' });
    const ledger = await imp(m);
    expect(ledger.unhandled).toEqual(['icon.svg']);
  });

  it('still refuses the HTML case it was written for', async () => {
    const m = only({ 'screens.dc.html': '<div><script>x</script></div>' });
    const ledger = await imp(m);
    expect(ledger.unhandled).toEqual(['screens.dc.html']);
  });
});

describe('a first import creates the sidecar (T-015)', () => {
  it('creates the destination directory rather than ENOENTing on the first write', async () => {
    // The real defect: every other test in this file seeds INTO into the memFs
    // `dirs` list, and the stub's writeFile happily writes to any path — so a
    // filesystem where directories must exist is unrepresentable here. This
    // asserts the mkdir call itself, which is the part the stub can observe.
    const created: string[] = [];
    const m = only({ 'a.html': '<p style="color:#abc">a</p>' });
    const fs = {
      ...m.fs,
      mkdir: async (p: string) => {
        created.push(p);
      },
    } as unknown as FileSystem;
    await importDesignSource({ from: FROM, into: INTO, identity: 'design-1' }, localSourceFetcher(m.fs, CWD), fs);
    expect(created).toContain(INTO);
  });

  it('creates it before writing, so a run that lands nothing still prepared the destination', async () => {
    const order: string[] = [];
    const m = only({ 'a.html': '<p>licence: cc-by-nc-nd</p>' });
    const fs = {
      ...m.fs,
      mkdir: async (p: string) => {
        order.push(`mkdir:${p}`);
      },
      writeFile: async (p: string, b: string) => {
        order.push(`write:${p}`);
        await m.fs.writeFile(p, b);
      },
    } as unknown as FileSystem;
    const ledger = await importDesignSource(
      { from: FROM, into: INTO, identity: 'design-1' },
      localSourceFetcher(m.fs, CWD),
      fs,
    );
    expect(ledger.refused).toHaveLength(1);
    expect(order[0]).toBe(`mkdir:${INTO}`);
  });
});

describe('a real export has nested directories (T-016)', () => {
  /** The shape a real Claude Design export actually has: files at the root and
   *  an `uploads/` directory beside them. Every fixture before this one was
   *  flat, which is why the read loop's readFile-per-entry survived. */
  const nested = () =>
    memFs(
      {
        [`${CWD}/${FROM}/screens.dc.html`]: '<div style="color:#f7f5f1">a</div>',
        [`${CWD}/${FROM}/uploads/spec.html`]: '<p style="color:#1c1914">b</p>',
      },
      [`${CWD}/${FROM}`, `${CWD}/${FROM}/uploads`, INTO],
    );

  it('does not die reading a directory as if it were a file', async () => {
    const m = nested();
    await expect(imp(m)).resolves.toBeDefined();
  });

  it('lands a nested file at its relative path rather than flattening or skipping it', async () => {
    const m = nested();
    const ledger = await imp(m);
    expect(ledger.written).toContain('uploads/spec.html');
    expect(m.store[`${INTO}/uploads/spec.html`]).toBe('<p style="color:#1c1914">b</p>');
  });

  it('derives candidates from nested material too', async () => {
    const m = nested();
    const ledger = await imp(m);
    expect(ledger.tokenCandidates.map((c) => c.value)).toContain('#1c1914');
  });
});

describe('an interrupted import leaves nothing behind (NFR-001, T-017)', () => {
  /** NFR-001: "An interrupted import MUST leave the project in a state that
   *  still validates: at most 0 partially written files remain." The real run
   *  that found this crashed mid-read and left a 68 KB runtime in the sidecar
   *  with no manifest — the ledger describing what happened is the one file
   *  that never got written. */
  it('writes 0 files when a read fails partway through', async () => {
    const m = memFs(
      {
        [`${CWD}/${FROM}/a.html`]: '<p style="color:#abc">a</p>',
        [`${CWD}/${FROM}/b.html`]: '<p>b</p>',
      },
      [`${CWD}/${FROM}`, INTO],
    );
    // Fail on the second source read, after the first has been read and would
    // — under a write-as-you-go pass — already be on disk.
    let reads = 0;
    const fs = {
      ...m.fs,
      readFile: async (p: string) => {
        if (p.startsWith(`${CWD}/${FROM}/`)) {
          reads += 1;
          if (reads === 2) throw new Error('EIO: simulated read failure');
        }
        return m.fs.readFile(p);
      },
    } as unknown as FileSystem;

    await expect(imp({ ...m, fs })).rejects.toThrow(/simulated read failure/);
    const landed = Object.keys(m.store).filter((k) => k.startsWith(`${INTO}/`));
    expect(landed).toEqual([]);
  });

  it('writes the manifest whenever it writes anything at all', async () => {
    // The ledger is the record of what arrived and that none of it is
    // reviewed (FR-004, FR-006). Material on disk with no manifest beside it
    // is the state NFR-001 forbids, and is what the real run produced.
    const m = only({ 'a.html': '<p style="color:#abc">a</p>' });
    await imp(m);
    const landed = Object.keys(m.store).filter((k) => k.startsWith(`${INTO}/`));
    expect(landed.length).toBeGreaterThan(0);
    expect(m.store[`${INTO}/${MANIFEST_NAME}`]).toBeDefined();
  });
});

describe('a bare script lands, deliberately (FR-014 second sentence, T-018)', () => {
  it('lands a .js carrying executable content rather than withholding it', async () => {
    // The real import landed a design tool's 68 KB runtime. FR-014 now says
    // that is correct: being executable is not on its own a ground to withhold,
    // because a loose script breaks no artifact rule. Asserted rather than
    // assumed, since the behaviour was an accident of an extension list until
    // it was a decision.
    const m = only({ 'support.js': 'var a=1;function b(){return 2}' });
    const ledger = await imp(m);
    expect(ledger.written).toEqual(['support.js']);
    expect(ledger.unhandled).toEqual([]);
    expect(m.store[`${INTO}/support.js`]).toBe('var a=1;function b(){return 2}');
  });

  it('still refuses the HTML that carries the same content', async () => {
    // The distinction the requirement rests on: identical bytes, different
    // consequence for the project. One would break the artifact rules; one
    // cannot, because nothing parses it as an artifact.
    const m = only({ 'screens.html': '<div><script>var a=1</script></div>' });
    const ledger = await imp(m);
    expect(ledger.unhandled).toEqual(['screens.html']);
    expect(ledger.written).toEqual([]);
  });

  it('still withholds on a ground other than executability', async () => {
    // "withholding on other grounds this spec establishes is unaffected" —
    // FR-012's licence refusal is the one an unbounded obligation would have
    // made non-conformant, and it is checked before executability in code.
    const m = only({ 'brand.js': '/* licence: cc-by-nc-nd */ var a=1' });
    const ledger = await imp(m);
    expect(ledger.refused.map((r) => r.name)).toEqual(['brand.js']);
    expect(ledger.written).toEqual([]);
  });
});

describe('confirming a candidate writes it into the token set (FR-016, T-1204)', () => {
  const TOKEN_SET_PATH = '/repo/visual/tokens.html';
  const TOKENS_JSON_PATH = '/repo/visual/tokens/base.tokens.json';

  const tokenSetHtml = (version: string): string =>
    `<spec-token-set version="${version}" binds-from="2.0.0">\n` +
    '  <p>MAJOR when a token is removed or redefined; MINOR when added or deprecated; PATCH otherwise.</p>\n' +
    '</spec-token-set>';

  const candidate = {
    value: '#f7f5f1',
    kind: 'colour' as const,
    occurrences: 3,
    sources: ['a.html'],
    fromUnlanded: false,
    inferred: true as const,
    confirmed: false as const,
  };

  const confirmFs = (version = '2.1.0', json = '{}') =>
    memFs({ [TOKEN_SET_PATH]: tokenSetHtml(version), [TOKENS_JSON_PATH]: json }, [
      '/repo/visual',
      '/repo/visual/tokens',
    ]);

  /** The three confirmer-supplied fields default to a valid set, so each test
   *  overrides only the one it is about. */
  const confirm = (
    fs: FileSystem,
    over: Partial<Pick<ConfirmCandidateInput, 'name' | 'changeClass' | 'toVersion' | 'declaredFrom'>> = {},
  ) =>
    confirmTokenCandidate(
      {
        tokenSetPath: TOKEN_SET_PATH,
        tokensJsonPath: TOKENS_JSON_PATH,
        declaredFrom: '2.1.0',
        name: 'color.accent',
        changeClass: 'minor',
        toVersion: '2.2.0',
        candidate,
        ...over,
      },
      fs,
    );

  it('lands a named-and-classified candidate with provenance', async () => {
    const { fs, store } = confirmFs();
    const confirmed = await confirm(fs);
    expect(confirmed.name).toBe('color.accent');
    expect(confirmed.changeClass).toBe('minor');
    expect(confirmed.confirmed).toBe(true);

    const json = JSON.parse(store[TOKENS_JSON_PATH] as string);
    expect(json.color.accent.$value.hex).toBe('#f7f5f1');
    expect(json.color.accent.$extensions['dev.spectastic.import']).toEqual({ derived: true, confirmed: true });
  });

  it('refuses a candidate missing a name', async () => {
    const { fs } = confirmFs();
    await expect(confirm(fs, { name: undefined })).rejects.toBeInstanceOf(TokenConfirmationError);
  });

  it('refuses a produced version equal to the one the set already carries (FR-016)', async () => {
    // The one refusal FR-016 adds: a release moves the version. Absent and
    // unreadable belong to 098 NFR-002 and are checked separately; whether the
    // version *agrees* with the class is deliberately unowned, because deciding
    // that is an ordering 098 NFR-001 forbids.
    const { fs } = confirmFs('2.1.0');
    await expect(confirm(fs, { toVersion: '2.1.0' })).rejects.toBeInstanceOf(TokenConfirmationError);
    await expect(confirm(fs, { toVersion: '2.1.0' })).rejects.toThrow(/already carries/);
  });

  it('accepts a version that moves in either direction, because only equality is decided', async () => {
    // Not an ordering: a version that looks earlier is still a move, and this
    // check has no opinion about which way is correct. A fresh store per call —
    // a confirmation writes, so reusing one makes the second call's declared
    // from-version genuinely stale and the compare-and-swap fires instead.
    await expect(confirm(confirmFs('2.1.0').fs, { toVersion: '2.2.0' })).resolves.toBeDefined();
    await expect(confirm(confirmFs('2.1.0').fs, { toVersion: '2.0.9' })).resolves.toBeDefined();
  });

  it('refuses a candidate missing a change class', async () => {
    const { fs } = confirmFs();
    await expect(confirm(fs, { changeClass: undefined })).rejects.toBeInstanceOf(TokenConfirmationError);
  });

  it('refuses a candidate missing the produced version', async () => {
    // T-014. The bump policy is prose in the token set by design, so the tool
    // cannot derive this without substituting a policy of its own.
    const { fs } = confirmFs();
    await expect(confirm(fs, { toVersion: undefined })).rejects.toBeInstanceOf(TokenConfirmationError);
  });

  it('suggests nothing — not a name, not a class, not a version', async () => {
    const { fs } = confirmFs();
    let message = '';
    try {
      await confirm(fs, { name: undefined, changeClass: undefined, toVersion: undefined });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toMatch(/color\.|major|minor|patch|\d+\.\d+\.\d+/i);
  });

  it('writes the version the confirmer declared, never one it derived', async () => {
    // The defect T-014 records: the first implementation computed this by
    // semver arithmetic, which would have produced 2.2.0 here. A version that
    // standard arithmetic would NEVER produce from 2.1.0 + minor is the only
    // assertion that can tell the two apart.
    const { fs, store } = confirmFs();
    await confirm(fs, { toVersion: '3.5.7' });
    const html = store[TOKEN_SET_PATH] as string;
    expect(html).toContain('version="3.5.7"');
    expect(html).toContain('<spec-release from="2.1.0" to="3.5.7" class="minor">');
  });

  it('refuses a set that changed since it was read, rather than clobbering it', async () => {
    const { fs, store } = confirmFs('2.2.0'); // live is 2.2.0; confirmation was prepared against 2.1.0
    const before = { ...store };
    await expect(confirm(fs)).rejects.toThrow(/stale/);
    // Nothing written — a refusal, not a partial clobber.
    expect(store).toEqual(before);
  });

  it('keeps the derived record after confirmation', async () => {
    const { fs } = confirmFs();
    const confirmed = await confirm(fs);
    // FR-005's last clause: the record that this was DERIVED survives
    // confirmation — a reader should still be able to tell a token that
    // arrived from a design tool from one somebody decided on.
    expect(confirmed.inferred).toBe(true);
  });
});

// T-1703: the write emits the DTCG type matching a candidate's kind, records
// a colour in its own declared colour space, and refuses what it cannot
// represent — never assuming sRGB hex the way the pre-widening write did.
describe('a candidate is represented as the DTCG type its kind names, or refused (FR-016, T-1703)', () => {
  it('represents hex exactly as before — unchanged by this task', () => {
    expect(representColour('#0f172a')).toEqual({
      colorSpace: 'srgb',
      components: [0.0588, 0.0902, 0.1647],
      alpha: 1,
      hex: '#0f172a',
    });
  });

  it('represents oklch() in its own colour space, without converting to srgb', () => {
    const c = representColour('oklch(0.21 0.034 264.665)');
    expect(c).toEqual({ colorSpace: 'oklch', components: [0.21, 0.034, 264.665], alpha: 1 });
    expect(c).not.toHaveProperty('hex'); // no sRGB fallback for a space that isn't sRGB
  });

  it('represents rgb() as srgb, normalising the 0–255 scale to the 0–1 one hex already uses', () => {
    expect(representColour('rgb(248 250 252)')).toEqual({
      colorSpace: 'srgb',
      components: [248 / 255, 250 / 255, 252 / 255],
      alpha: 1,
      hex: '#f8fafc',
    });
  });

  it('represents rgb() given as percentages without dividing by 255', () => {
    expect(representColour('rgb(100% 50% 0%)')).toEqual({
      colorSpace: 'srgb',
      components: [1, 0.5, 0],
      alpha: 1,
      hex: '#ff8000',
    });
  });

  it('reads a legacy comma-syntax alpha as the fourth argument', () => {
    const c = representColour('rgba(0, 0, 0, 0.5)');
    expect(c?.alpha).toBe(0.5);
  });

  it('reads a modern slash-syntax alpha', () => {
    const c = representColour('hsl(217 91% 60% / 50%)');
    expect(c?.alpha).toBe(0.5);
  });

  it('represents every other named notation in its own space, as authored', () => {
    expect(representColour('hsl(217 91% 60%)')).toEqual({ colorSpace: 'hsl', components: [217, 91, 60], alpha: 1 });
    expect(representColour('hwb(120 30% 40%)')).toEqual({ colorSpace: 'hwb', components: [120, 30, 40], alpha: 1 });
    expect(representColour('lab(29.2345% 39.3825 20.0664)')?.colorSpace).toBe('lab');
    expect(representColour('lch(52.2% 72.2 50)')?.colorSpace).toBe('lch');
    expect(representColour('oklab(59.69% 0.1007 0.1191)')?.colorSpace).toBe('oklab');
  });

  it('represents color() in the predefined space it names', () => {
    expect(representColour('color(display-p3 1 0.5 0)')).toEqual({
      colorSpace: 'display-p3',
      components: [1, 0.5, 0],
      alpha: 1,
    });
  });

  it('refuses color() naming a custom profile — no DTCG colour space has one', () => {
    expect(representColour('color(--brand 0.5 0.2 0.1)')).toBeUndefined();
  });

  it('refuses color() naming a space DTCG does not list', () => {
    expect(representColour('color(xyz 0.1 0.2 0.3)')).toBeUndefined(); // DTCG has xyz-d65/xyz-d50, not bare "xyz"
  });

  it('refuses a value that is not a colour notation at all', () => {
    expect(representColour('16px')).toBeUndefined();
  });

  it('represents px and rem, DTCG dimension\'s only permitted units', () => {
    expect(representSpacing('16px')).toEqual({ value: 16, unit: 'px' });
    expect(representSpacing('1.5rem')).toEqual({ value: 1.5, unit: 'rem' });
  });

  it('refuses em — derivable (T-1702), and deliberately not representable', () => {
    expect(representSpacing('1.25em')).toBeUndefined();
  });

  it('refuses a bare unitless zero rather than guessing a unit', () => {
    // DTCG requires a unit even at zero and names no default; assigning one
    // (px, say) would be exactly the invented fact this write declines to add.
    expect(representSpacing('0')).toBeUndefined();
  });

  it('representToken dispatches on kind and throws TokenConfirmationError naming the value', () => {
    expect(representToken({ kind: 'colour', value: '#0f172a' })).toEqual({
      $type: 'color',
      $value: representColour('#0f172a'),
    });
    expect(representToken({ kind: 'spacing', value: '16px' })).toEqual({
      $type: 'dimension',
      $value: { value: 16, unit: 'px' },
    });
    expect(() => representToken({ kind: 'colour', value: 'color(--brand 0.5 0.2 0.1)' })).toThrow(TokenConfirmationError);
    expect(() => representToken({ kind: 'colour', value: 'color(--brand 0.5 0.2 0.1)' })).toThrow(/color\(--brand/);
    expect(() => representToken({ kind: 'spacing', value: '1.25em' })).toThrow(TokenConfirmationError);
  });
});

// T-1703's other half: confirming an unrepresentable candidate through the
// real write path writes NOTHING — no token, no version move, no release.
// (The corrupt-write regression itself — what the OLD write produced for
// oklch() before this task — is T-1704's.)
describe('an unrepresentable candidate refuses the whole write, before anything is touched (FR-016, T-1703)', () => {
  it('leaves both files byte-for-byte unchanged on refusal', async () => {
    const tokenSetPath = '/repo/visual/tokens.html';
    const tokensJsonPath = '/repo/visual/tokens/base.tokens.json';
    const tokenSetHtml =
      '<spec-token-set version="1.0.0" binds-from="1.0.0">\n' +
      '  <p>MAJOR when a token is removed or redefined; MINOR when added or deprecated; PATCH otherwise.</p>\n' +
      '</spec-token-set>';
    const { fs, store } = memFs({ [tokenSetPath]: tokenSetHtml, [tokensJsonPath]: '{}' }, ['/repo/visual']);
    const before = { ...store };

    await expect(
      confirmTokenCandidate(
        {
          tokenSetPath,
          tokensJsonPath,
          declaredFrom: '1.0.0',
          name: 'colour.brand',
          changeClass: 'minor',
          toVersion: '1.1.0',
          candidate: {
            value: 'color(--brand 0.5 0.2 0.1)',
            kind: 'colour',
            occurrences: 1,
            sources: ['screen.html'],
            fromUnlanded: false,
            inferred: true,
            confirmed: false,
          },
        },
        fs,
      ),
    ).rejects.toBeInstanceOf(TokenConfirmationError);

    expect(store).toEqual(before); // no token, no version move, no release
  });
});

// T-1704 — the regression this whole change exists to close, run through the
// REAL write path (not the pure representColour function T-1703 tests
// directly). Before this change, confirming this exact oklch() value wrote
// `hex: "#oklch("` with `components: [null, null, null]`, raised no error,
// and moved the token set's version — verified by hand against the built
// kernel while triaging T-021.
describe('the corrupt write this change exists to close (FR-016, T-1704)', () => {
  const tokenSetPath = '/repo/visual/tokens.html';
  const tokensJsonPath = '/repo/visual/tokens/base.tokens.json';
  const tokenSetHtml =
    '<spec-token-set version="1.0.0" binds-from="1.0.0">\n' +
    '  <p>MAJOR when a token is removed or redefined; MINOR when added or deprecated; PATCH otherwise.</p>\n' +
    '</spec-token-set>';
  const oklchCandidate = {
    value: 'oklch(0.21 0.034 264.665)',
    kind: 'colour' as const,
    occurrences: 3,
    sources: ['screen.html'],
    fromUnlanded: true,
    inferred: true as const,
    confirmed: false as const,
  };

  it('confirming oklch() writes a correct oklch token, never the old hex garbage', async () => {
    const { fs, store } = memFs({ [tokenSetPath]: tokenSetHtml, [tokensJsonPath]: '{}' }, ['/repo/visual']);
    await confirmTokenCandidate(
      { tokenSetPath, tokensJsonPath, declaredFrom: '1.0.0', name: 'colour.accent', changeClass: 'minor', toVersion: '1.1.0', candidate: oklchCandidate },
      fs,
    );
    const json = JSON.parse(store[tokensJsonPath] as string);
    const written = json.colour.accent.$value;
    expect(written).not.toHaveProperty('hex', '#oklch(');
    expect(written.components).not.toEqual([null, null, null]);
    expect(written).toEqual({ colorSpace: 'oklch', components: [0.21, 0.034, 264.665], alpha: 1 });
    expect(store[tokenSetPath]).toContain('version="1.1.0"'); // a representable value DOES move the version
  });

  it('a refused confirmation leaves the token set version exactly as it was', async () => {
    const { fs, store } = memFs({ [tokenSetPath]: tokenSetHtml, [tokensJsonPath]: '{}' }, ['/repo/visual']);
    const emCandidate = {
      value: '1.25em',
      kind: 'spacing' as const,
      occurrences: 1,
      sources: ['screen.html'],
      fromUnlanded: false,
      inferred: true as const,
      confirmed: false as const,
    };
    await expect(
      confirmTokenCandidate(
        { tokenSetPath, tokensJsonPath, declaredFrom: '1.0.0', name: 'space.gap', changeClass: 'minor', toVersion: '1.1.0', candidate: emCandidate },
        fs,
      ),
    ).rejects.toBeInstanceOf(TokenConfirmationError);
    expect(store[tokenSetPath]).toBe(tokenSetHtml); // byte-for-byte — no release, no version bump
    expect(store[tokensJsonPath]).toBe('{}'); // no token written either
  });
});

/**
 * 105 FR-017 / FR-010's boundary — a declared token is not a guess.
 *
 * A real import left 45 colour candidates unconfirmed beside an empty token
 * set, and the importer mined the declared token file ITSELF, so a named typed
 * DTCG token came back INFERRED — UNCONFIRMED. That is US3 inverted: not an
 * inference passing for a declaration, but a declaration presented as an
 * inference.
 */
describe('a declared token set is read, not mined (105 FR-017)', () => {
  const TOKENS = JSON.stringify({ color: { brand: { $type: 'color', $value: '#aa1122' } } });
  const SHEET = '<div style="color:#aa1122;background:#bb3344">c</div>';

  it('recognises a token file by shape, not by name', () => {
    expect(isTokenFile('anything.json', TOKENS)).toBe(true);
    expect(isTokenFile('design.tokens.json', '{"a":1}')).toBe(false);
    expect(isTokenFile('notes.md', TOKENS)).toBe(false);
  });

  // The project's own set puts $type on the GROUP and $value on the leaf.
  it('recognises a set whose $type is inherited from a group', () => {
    const grouped = JSON.stringify({ space: { $type: 'dimension', '100': { $value: { value: 4, unit: 'px' } } } });
    expect(isTokenFile('base.tokens.json', grouped)).toBe(true);
  });

  it('cannot be fooled by prose mentioning $value', () => {
    expect(isTokenFile('readme.json', JSON.stringify({ note: 'the $value key means something' }))).toBe(false);
  });

  it('never offers a declared token as a candidate', () => {
    const out = deriveTokenCandidates([
      { name: 'tokens.json', body: TOKENS, landed: true },
      { name: 'screen.html', body: SHEET, landed: true },
    ]);
    expect(out.map((c) => c.value)).toEqual(['#bb3344']);
  });

  it('does not mine the token file for its own values', () => {
    const out = deriveTokenCandidates([{ name: 'tokens.json', body: TOKENS, landed: true }]);
    expect(out).toEqual([]);
  });

  it('behaves exactly as before for an export with no token file', () => {
    const out = deriveTokenCandidates([{ name: 'screen.html', body: SHEET, landed: true }]);
    expect(out.map((c) => c.value).sort()).toEqual(['#aa1122', '#bb3344']);
  });

  it('reads every colour a declared set carries, at any depth', () => {
    const nested = JSON.stringify({ a: { b: { c: { $type: 'color', $value: '#ABCDEF' } } } });
    expect([...declaredColourValues(nested)]).toEqual(['#abcdef']);
  });
});
