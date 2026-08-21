import { describe, expect, it, vi } from 'vitest';
import { renderDesign } from '../src/visual/render-capture.js';
import type { FileSystem, KernelContext, Renderer } from '../src/types.js';

/**
 * The write location, and the dot-segment refusal (106-visual-render, US1 /
 * T-103, FR-008).
 *
 * FR-008: "Captures MUST be written inside the visual directory of the spec
 * that owns the screens, and MUST NOT be placed behind a path segment
 * beginning with a dot." Two properties, one file: where a good capture
 * lands, and what happens when the computed destination is unsafe.
 *
 * renderDesign doesn't exist yet (T-110/T-112 build it, in
 * packages/core/src/visual/render.ts); this file is expected to fail to
 * type-check/run until then — the same red state render.egress.test.ts
 * records for T-100/T-101 and binary-fs.test.ts records for T-200/T-210.
 *
 * NOTE ON A PRE-EXISTING NAME COLLISION: packages/core/src/visual/render.ts
 * already exists today, but for an unrelated module — 099-visual-embedded-
 * view's `readRenders`/`renderAltText`, which read <spec-render> DECLARATIONS
 * out of a screen sidecar. 106's own design.html §9 names the same path
 * ("visual/render.ts   the verb: preflight, capture, account, manifest") for
 * this spec's verb, so T-110/T-112 inherit a real collision to resolve
 * (merge the two, or rename one) — not this task's problem to fix, but
 * worth recording here since it's the reason this import currently resolves
 * to a file that exports neither `renderDesign` nor a KernelContext-shaped
 * signature.
 *
 * (input, ctx) mirrors render.egress.test.ts's established shape —
 * `renderDesign({ location, destDir }, ctx: KernelContext)`. `destDir` is
 * project-relative and supplied by the CALLER (the CLI, per T-114); FR-008's
 * "owning spec" is realised by the caller computing
 * `specs/<spec-id>/visual/renders` per 094 FR-002's convention (see
 * packages/core/src/visual/location.ts's `conventionalVisualPrefix('screens',
 * specId)`), not by renderDesign deriving a spec id itself — there is no
 * `specId` field on the input shape T-100's sibling test already committed
 * to. So the "write location" property this file can assert is narrower and
 * more honest than "given a specId": renderDesign faithfully writes each
 * capture under `join(ctx.cwd, destDir, <slug>.<ext>)`, and REFUSES outright
 * when destDir itself carries a dot-segment.
 *
 * WHY THE DOT-SEGMENT REFUSAL IS MODELLED AS A THROW, NOT A PER-CAPTURE
 * `result.refused` ENTRY: FR-008's second clause is a structural precondition
 * on the destination every capture in the run would land under — if destDir
 * is unsafe, EVERY capture in this run is unsafe, not just one artboard's.
 * That is the same shape as T-100's offline-egress preflight (SC-003: "the
 * verb exits with a stated reason and writes 0 capture files") rather than
 * T-101's template guard, which is legitimately per-artboard because a
 * template-unexpanded label is a defect in ONE render, not in where the run
 * as a whole is pointed. Driving the whole verb (rather than unit-testing a
 * smaller `isPathSafe`-shaped helper) is deliberate too: no such helper is
 * exported by anything today, so asserting against one would be inventing an
 * internal shape T-112 hasn't chosen yet; asserting the externally-observable
 * refusal is robust to whatever internal check T-112 lands.
 */

function stubFs(writeBinary = vi.fn(async () => {})): FileSystem & { writeBinary: typeof writeBinary } {
  return {
    readFile: async () => {
      throw new Error('unused in this test');
    },
    // A no-op, not a throw: T-311 (render.manifest.test.ts) made renderDesign
    // write a manifest.json via fs.writeFile on every run, which these
    // pre-existing tests don't assert about — only writeBinary matters here.
    writeFile: async () => {},
    readdir: async () => [],
    stat: async () => {
      throw new Error('ENOENT: unused in this test');
    },
    rename: async () => {},
    rm: async () => {},
    mkdir: async () => {},
    readBinary: async () => {
      throw new Error('unused in this test');
    },
    writeBinary,
  };
}

function stubRenderer(label: string): Renderer {
  return {
    checkEgress: async () => true,
    render: async () => ({
      captures: [{ label, bytes: new Uint8Array([9, 8, 7, 6]), consoleErrors: [] }],
    }),
  };
}

describe('the write location (106 FR-008)', () => {
  it("writes a capture under the owning spec's visual/renders/, joined against ctx.cwd", async () => {
    const writeBinary = vi.fn(async () => {});
    const fs = stubFs(writeBinary);
    const ctx: KernelContext = { cwd: '/repo', fs, render: stubRenderer('converted · light') };

    await renderDesign(
      { location: '/repo/design-export/index.html', destDir: 'specs/001-example/visual/renders' },
      ctx,
    );

    expect(writeBinary).toHaveBeenCalledTimes(1);
    const [writtenPath, writtenBytes] = writeBinary.mock.calls[0]!;

    // Matched against the exemplar's own committed capture —
    // examples/currency-converter/specs/001-currency-conversion/visual/renders/converted-ios-light.svg
    // — which is specs/<spec-id>/visual/renders/<slug>.<ext>. The extension
    // is deliberately left unpinned: RenderCapture (types.ts) carries no
    // format field, so what a capture is ENCODED as isn't this requirement's
    // contract — FR-008 governs only WHERE it lands.
    expect(String(writtenPath)).toMatch(/^\/repo\/specs\/001-example\/visual\/renders\/converted-light\.[a-z0-9]+$/);
    expect(Array.from(writtenBytes as Uint8Array)).toEqual([9, 8, 7, 6]);
  });
});

describe('the dot-segment refusal (106 FR-008)', () => {
  it('refuses before writing anything when destDir carries a path segment beginning with a dot', async () => {
    const writeBinary = vi.fn(async () => {});
    const fs = stubFs(writeBinary);
    const ctx: KernelContext = { cwd: '/repo', fs, render: stubRenderer('converted · light') };

    // A destDir smuggling a dot-segment. '..' begins with '.' and so does an
    // explicit dotfile-style directory — either shape is the exact trap
    // FR-008's own rationale names: "the dot prohibition is the same trap
    // 094 FR-006 names — an ignore rule silently excluding images — and it
    // is not hypothetical: a dotfile filter is precisely why the one
    // tool-made image was invisible rather than refused."
    const dotDestDir = 'specs/001-example/visual/../../.hidden/renders';

    await expect(
      renderDesign({ location: '/repo/design-export/index.html', destDir: dotDestDir }, ctx),
    ).rejects.toThrow(/dot/i);

    // The whole point of FR-008's second clause: nothing lands anywhere,
    // never a partial write to the unsafe location.
    expect(writeBinary).not.toHaveBeenCalled();
  });

  it('refuses a destDir behind a bare dotfile-style directory too, not only a traversal ("..")', async () => {
    const writeBinary = vi.fn(async () => {});
    const fs = stubFs(writeBinary);
    const ctx: KernelContext = { cwd: '/repo', fs, render: stubRenderer('converted · light') };

    // No traversal here — just a segment beginning with '.' inside an
    // otherwise-conventional destDir. Covers the FR-008 rationale's actual
    // failure mode (a dotfile filter), which a "..'-only" check would miss.
    const dotDestDir = 'specs/001-example/visual/.thumbnails/renders';

    await expect(
      renderDesign({ location: '/repo/design-export/index.html', destDir: dotDestDir }, ctx),
    ).rejects.toThrow(/dot/i);

    expect(writeBinary).not.toHaveBeenCalled();
  });
});
