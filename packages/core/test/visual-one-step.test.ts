import { describe, expect, it } from 'vitest';
import { runVisualOneStep } from '../src/visual/one-step.js';
import type { FileSystem, Renderer } from '../src/types.js';

/**
 * T-100 of specs/110-visual-one-step/tasks.html (US1, FR-001).
 *
 * `runVisualOneStep` doesn't exist yet — this file is expected to fail to
 * resolve until T-110 builds it, the same red state
 * render.egress.test.ts records for its own kernel.
 *
 * A full in-memory FileSystem (not a throwing stub) because this test
 * genuinely exercises all three steps: import reads the export directory,
 * render writes a PNG and a manifest, materialise reads and rewrites
 * design.html.
 */

function memFs(files: Record<string, string> = {}, dirs: string[] = []) {
  const store = { ...files };
  const binaries = new Map<string, Uint8Array>();
  const madeDirs = new Set<string>(dirs);
  for (const f of Object.keys(files)) {
    const parts = f.split('/');
    for (let i = 1; i < parts.length; i++) madeDirs.add(parts.slice(0, i).join('/'));
  }
  for (const d of dirs) {
    const parts = d.split('/');
    for (let i = 1; i < parts.length; i++) madeDirs.add(parts.slice(0, i).join('/'));
  }
  const isDir = (p: string): boolean => madeDirs.has(p);
  const markDirs = (p: string): void => {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) madeDirs.add(parts.slice(0, i).join('/'));
  };

  const fs: FileSystem = {
    readFile: async (p: string) => {
      if (isDir(p)) {
        const e = new Error('EISDIR');
        (e as NodeJS.ErrnoException).code = 'EISDIR';
        throw e;
      }
      if (!(p in store)) throw new Error(`ENOENT ${p}`);
      return store[p] as string;
    },
    writeFile: async (p: string, body: string) => {
      markDirs(p);
      store[p] = body;
    },
    readdir: async (p: string) => {
      const kids = new Set<string>();
      for (const k of [...Object.keys(store), ...binaries.keys(), ...madeDirs]) {
        if (!k.startsWith(`${p}/`)) continue;
        const rest = k.slice(p.length + 1);
        if (rest.length > 0) kids.add(rest.split('/')[0] as string);
      }
      return [...kids].sort();
    },
    stat: async (p: string) => {
      if (isDir(p)) return { isFile: false, isDirectory: true };
      if (p in store || binaries.has(p)) return { isFile: true, isDirectory: false };
      throw new Error(`ENOENT ${p}`);
    },
    rename: async (from: string, to: string) => {
      if (from in store) {
        store[to] = store[from] as string;
        delete store[from];
      }
    },
    rm: async (p: string) => {
      delete store[p];
      binaries.delete(p);
    },
    mkdir: async (p: string) => markDirs(`${p}/.`),
    readBinary: async (p: string) => {
      const b = binaries.get(p);
      if (b === undefined) throw new Error(`ENOENT ${p}`);
      return b;
    },
    writeBinary: async (p: string, content: Uint8Array) => {
      markDirs(p);
      binaries.set(p, content);
    },
  };
  return { fs, store, binaries };
}

/** A spy renderer, not a labels-in/captures-out fake. Real reason: import's
 *  own fetcher unconditionally requires `from` to be a DIRECTORY ("An export
 *  is a folder of files" — local-source-fetcher.ts), and the one-step flow
 *  passes the SAME `from` to render. Navigating a browser to a directory
 *  finds no `[data-screen-label]` elements — this is exactly the case
 *  110's own spec names as legitimate ("the export resolves but declares no
 *  artboards... not a refusal"), so asserting a real capture here would
 *  assert something the design cannot structurally produce. What this test
 *  CAN honestly prove is that render is genuinely invoked with the derived
 *  location, not skipped. */
function spyRenderer(): Renderer & { calledWith: string[] } {
  const calledWith: string[] = [];
  return {
    calledWith,
    checkEgress: async () => true,
    render: async (location: string) => {
      calledWith.push(location);
      return { captures: [] };
    },
  };
}

const CWD = '/repo';

describe('runVisualOneStep sequences import, render, materialise (FR-001, T-100)', () => {
  it('runs all three steps in order and reports each completed', async () => {
    const { fs, store } = memFs(
      {
        '/repo/export/a.html': '<div data-screen-label="one" style="width:10px;height:10px;"></div>',
        '/repo/specs/001-x/design.html': '<!doctype html><html><body><h1>x</h1></body></html>',
      },
      ['/repo/export', '/repo/specs/001-x'],
    );
    const render = spyRenderer();

    const report = await runVisualOneStep({ specId: '001-x', from: 'export' }, { cwd: CWD, fs, render });

    expect(report.map((r) => r.step)).toEqual(['import', 'render', 'materialise']);
    expect(report.every((r) => r.outcome.kind === 'completed')).toBe(true);

    // Import genuinely landed the export. importDesignSource uses `into`
    // VERBATIM (no cwd-join) — its established contract, confirmed against
    // its own source (visual/import.ts:334) — so the key has no `/repo`
    // prefix even though renderDesign's destDir gets one internally
    // (render-capture.ts:135, 155). Two kernels, two conventions; the
    // orchestrator passes each what it expects.
    expect(Object.keys(store).some((k) => k.startsWith('specs/001-x/visual/') && k.endsWith('a.html'))).toBe(true);
    // Render was genuinely invoked (not skipped) with the derived location.
    expect(render.calledWith).toEqual(['file:///repo/export']);
  });
});

// T-200 (US2, FR-003). The orchestrator's own preflight — distinct from
// design.ts's model-call-ordering concern (T-210), which is a CLI-level
// wiring question this file cannot test at all. This is the narrower,
// already-true half: `import`'s own fetcher checks readability before any
// write (105's two-phase discipline — decide everything, write only once
// nothing can still fail), so an unreadable export never lands a byte and
// never reaches render or materialise.
describe('runVisualOneStep refuses before any step completes, on an unreadable export (FR-003, T-200)', () => {
  it('rejects naming the path, and writes nothing', async () => {
    const { fs, store } = memFs({ '/repo/specs/001-x/design.html': '<!doctype html><html><body></body></html>' }, [
      '/repo/specs/001-x',
    ]);
    const render = spyRenderer();

    await expect(
      runVisualOneStep({ specId: '001-x', from: 'does-not-exist' }, { cwd: CWD, fs, render }),
    ).rejects.toThrow(/does-not-exist/);

    // Render was never reached, and nothing was written anywhere.
    expect(render.calledWith).toEqual([]);
    expect(store).toEqual({ '/repo/specs/001-x/design.html': '<!doctype html><html><body></body></html>' });
  });
});
