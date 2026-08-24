import { describe, expect, it, vi } from 'vitest';
import { renderDesign } from '../src/visual/render-capture.js';
import { buildManifest } from '../src/visual/render-manifest.js';
import type { FileSystem, KernelContext, Renderer } from '../src/types.js';

/**
 * The run manifest (106-visual-render, US3 / T-300, T-301, T-302, FR-009,
 * FR-011, SC-002).
 *
 * Three properties, one file, mirroring render.egress.test.ts's shape:
 *   - T-300 (FR-009): a console error is recorded against its capture in the
 *     manifest, never discarded — a silently half-rendered artboard is worse
 *     evidence than none, because a reader cannot tell by looking.
 *   - T-301 (FR-011/SC-002): every artboard the render found is accounted
 *     for — captured-count plus not-captured-count equals N, always.
 *   - T-302 (FR-011): re-running the verb against the same artboard replaces
 *     its capture without a flag — FR-010 already forbids comparing against
 *     anything, so a guard would buy nothing but cost a flag on every
 *     honest re-run.
 *
 * design.html D-006: "A manifest beside the captures, recording each
 * artboard as captured or not-captured-with-a-reason, and any console error
 * against its capture" — persisted as a file under the same destDir the
 * captures land in (design.html §9 project structure: "captures + the run
 * manifest"), which is what these tests read back via a stubbed
 * `fs.writeFile`.
 */

function stubFs(overrides: Partial<FileSystem> = {}): FileSystem & {
  writeBinary: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
} {
  const writeBinary = vi.fn(async () => {});
  const writeFile = vi.fn(async () => {});
  return {
    readFile: async () => {
      throw new Error('unused in this test');
    },
    writeFile,
    readdir: async () => [],
    // The source is stat-ed now, because 106 FR-012 makes resolving it the
    // verb's own job — a page passes through, a directory or archive is
    // expanded. These tests are about the MANIFEST, so the stub reports the
    // location as an ordinary file and resolution takes the page path
    // straight through, exactly as it did when the string was navigated raw.
    stat: async () => ({ isFile: true, isDirectory: false, isSymbolicLink: false }),
    rename: async () => {},
    rm: async () => {},
    mkdir: async () => {},
    readBinary: async () => {
      throw new Error('unused in this test');
    },
    writeBinary,
    ...overrides,
  };
}

describe('the run manifest — console errors recorded (106 FR-009)', () => {
  it('captures an artboard that logged a console error, and records the error against its manifest entry rather than discarding it', async () => {
    const renderer: Renderer = {
      checkEgress: async () => true,
      render: async () => ({
        captures: [
          {
            label: 'converted · light',
            bytes: new Uint8Array([1, 2, 3]),
            consoleErrors: ['TypeError: rate is undefined'],
          },
        ],
      }),
    };
    const fs = stubFs();
    const ctx: KernelContext = { cwd: '/project', fs, render: renderer };

    await renderDesign(
      { location: '/project/design-export/index.html', destDir: 'specs/106-visual-render/visual/renders' },
      ctx,
    );

    // Written to disk, never held only in memory — a reader of the manifest
    // file must see it too (FR-009's "MUST NOT be discarded").
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    const [manifestPath, manifestContent] = fs.writeFile.mock.calls[0]!;
    expect(String(manifestPath)).toMatch(/specs\/106-visual-render\/visual\/renders\/.*manifest/);
    const manifest = JSON.parse(manifestContent as string);
    const entry = manifest.entries.find((e: { label: string }) => e.label === 'converted · light');
    expect(entry).toBeDefined();
    expect(entry.consoleErrors).toEqual(['TypeError: rate is undefined']);
    expect(entry.status).toBe('captured');
  });
});

describe('the run manifest — every artboard accounted for (106 FR-011, SC-002)', () => {
  it('reports captured-count plus not-captured-count equal to the number of artboards found', async () => {
    const renderer: Renderer = {
      checkEgress: async () => true,
      render: async () => ({
        captures: [
          { label: 'converted · light', bytes: new Uint8Array([1]), consoleErrors: [] },
          { label: '{{ s.id }} · dark', bytes: new Uint8Array([2]), consoleErrors: [] },
          { label: 'picker · light', bytes: new Uint8Array([3]), consoleErrors: [] },
        ],
      }),
    };
    const fs = stubFs();
    const ctx: KernelContext = { cwd: '/project', fs, render: renderer };

    const result = await renderDesign(
      { location: '/project/design-export/index.html', destDir: 'specs/106-visual-render/visual/renders' },
      ctx,
    );

    // 3 found (SC-002): 2 captured + 1 refused (the template-labelled one).
    expect(result.written).toHaveLength(2);
    expect(result.refused).toHaveLength(1);

    const [, manifestContent] = fs.writeFile.mock.calls[0]!;
    const manifest = JSON.parse(manifestContent as string);
    expect(manifest.entries).toHaveLength(3);
    const captured = manifest.entries.filter((e: { status: string }) => e.status === 'captured');
    const notCaptured = manifest.entries.filter((e: { status: string }) => e.status === 'not-captured');
    expect(captured).toHaveLength(2);
    expect(notCaptured).toHaveLength(1);
    expect(notCaptured[0].reason).toMatch(/template/i);
  });
});

describe('the run manifest — paths are portable (106 FR-011)', () => {
  it("records a project-relative path, never an absolute one carrying the author's filesystem", async () => {
    const renderer: Renderer = {
      checkEgress: async () => true,
      render: async () => ({
        captures: [{ label: 'converted · light', bytes: new Uint8Array([1]), consoleErrors: [] }],
      }),
    };
    const fs = stubFs();
    const ctx: KernelContext = { cwd: '/Users/someone/project', fs, render: renderer };

    await renderDesign(
      { location: '/project/design-export/index.html', destDir: 'specs/106-visual-render/visual/renders' },
      ctx,
    );

    const [, manifestContent] = fs.writeFile.mock.calls[0]!;
    const manifest = JSON.parse(manifestContent as string);
    const entry = manifest.entries[0];

    // The manifest is COMMITTED beside the captures it describes, so an
    // absolute path would be meaningless to every reader but the machine
    // that produced it — and would leak that machine's layout into the
    // repository. Found by exercising the verb for real (T-115) rather
    // than by any unit test, which is exactly the gap the discipline
    // about running the thing exists to close.
    expect(entry.path).toBe('specs/106-visual-render/visual/renders/converted-light.png');
    expect(entry.path).not.toContain(ctx.cwd);
    expect(entry.path.startsWith('/')).toBe(false);
  });
});

describe('the run manifest — a re-run replaces without a flag (106 FR-011)', () => {
  it('overwrites the same capture and manifest on a second run against the same artboard, with no existence check in between', async () => {
    const renderer: Renderer = {
      checkEgress: async () => true,
      render: async () => ({
        captures: [{ label: 'converted · light', bytes: new Uint8Array([9]), consoleErrors: [] }],
      }),
    };
    const fs = stubFs();
    const ctx: KernelContext = { cwd: '/project', fs, render: renderer };
    const input = { location: '/project/design-export/index.html', destDir: 'specs/106-visual-render/visual/renders' };

    await renderDesign(input, ctx);
    await renderDesign(input, ctx);

    // Two runs, two writes to the SAME path each time — no "already exists,
    // skip" guard anywhere (FR-010 already forbids comparing, so a guard
    // would buy nothing).
    expect(fs.writeBinary).toHaveBeenCalledTimes(2);
    const firstCapturePath = fs.writeBinary.mock.calls[0]![0];
    const secondCapturePath = fs.writeBinary.mock.calls[1]![0];
    expect(secondCapturePath).toBe(firstCapturePath);

    // The manifest is rewritten fresh each run — 1 entry, not an
    // accumulating 2 — so a re-run's manifest describes only the run that
    // just happened, never a merge with the previous one.
    expect(fs.writeFile).toHaveBeenCalledTimes(2);
    const secondManifest = JSON.parse(fs.writeFile.mock.calls[1]![1] as string);
    expect(secondManifest.entries).toHaveLength(1);
  });
});

// T-1104 (106 FR-013). A source that resolved and was read but declared no
// artboards is REPORTED — not as a refusal, since a source may legitimately
// declare none, but never as silence. The silence it replaces is what let a
// source-shape mismatch survive a full lifecycle pass with a green suite:
// zero artboards found meant the accounting had nothing to say about them,
// and it said it correctly.
describe('the run manifest — a source that yielded no artboards (106 FR-013)', () => {
  it('reports the fact rather than writing an empty manifest silently', () => {
    const manifest = buildManifest([], [], 'file:///project/design-export/index.html');
    expect(manifest.entries).toEqual([]);
    expect(manifest.noArtboards?.source).toBe('file:///project/design-export/index.html');
    expect(manifest.noArtboards?.note).toMatch(/declared no artboards/);
  });

  it('says nothing when something was captured', () => {
    const manifest = buildManifest(
      [{ label: 'one', path: 'specs/001-x/visual/renders/one.png', consoleErrors: [] }],
      [],
      'file:///project/design-export/index.html',
    );
    expect(manifest.noArtboards).toBeUndefined();
  });
});
