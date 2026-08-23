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

function fakeRenderer(labels: string[]): Renderer {
  return {
    checkEgress: async () => true,
    render: async () => ({
      captures: labels.map((label) => ({ label, bytes: new Uint8Array([1, 2, 3]), consoleErrors: [] })),
    }),
  };
}

const CWD = '/repo';

describe('runVisualOneStep sequences import, render, materialise (FR-001, T-100)', () => {
  it('runs all three steps in order and reports each completed', async () => {
    const { fs, store, binaries } = memFs(
      {
        '/repo/export/a.html': '<div data-screen-label="one" style="width:10px;height:10px;"></div>',
        '/repo/specs/001-x/design.html': '<!doctype html><html><body><h1>x</h1></body></html>',
      },
      ['/repo/export', '/repo/specs/001-x'],
    );

    const report = await runVisualOneStep(
      { specId: '001-x', from: 'export/a.html' },
      { cwd: CWD, fs, render: fakeRenderer(['one']) },
    );

    expect(report.map((r) => r.step)).toEqual(['import', 'render', 'materialise']);
    expect(report.every((r) => r.outcome.kind === 'completed')).toBe(true);

    // Import genuinely landed the export.
    expect(Object.keys(store).some((k) => k.startsWith('/repo/specs/001-x/visual/') && k.endsWith('a.html'))).toBe(
      true,
    );
    // Render genuinely wrote a capture.
    expect([...binaries.keys()].some((k) => k.includes('one'))).toBe(true);
  });
});
