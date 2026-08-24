import { describe, expect, it, vi } from 'vitest';
import { renderDesign } from '../src/visual/render-capture.js';
import type { FileSystem, KernelContext, Renderer } from '../src/types.js';

/**
 * The offline preflight and the template guard (106-visual-render, US1 /
 * T-100 + T-101). One file, two describe blocks — one per task, per design
 * D-001, which pairs them deliberately: the preflight refuses a WHOLE run
 * before the browser opens, and the template guard catches what the
 * preflight cannot — a CDN that answers but serves something broken, caught
 * PER ARTBOARD after load.
 *
 * renderDesign doesn't exist yet (T-110 builds it, and packages/render's
 * adapter T-113 supplies the real Renderer); this file is expected to fail
 * to type-check/run until then — that is the correct red state, the same
 * one binary-fs.test.ts records for T-200/T-210.
 *
 * (input, ctx) mirrors the shape every other kernel command uses
 * (validateCommand, designCommand, …) and the one design's own prose assumes
 * — "call ctx.render.checkEgress()" reads a Renderer off a KernelContext,
 * not a positional fetcher/fs pair the way importDesignSource takes.
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
    // Stat-ed since 106 FR-012 made resolving the source the verb's own job;
    // reporting it as a file takes the page path straight through, as the raw
    // navigation did before.
    stat: async () => ({ isFile: true, isDirectory: false, isSymbolicLink: false }),
    rename: async () => {},
    rm: async () => {},
    mkdir: async () => {},
    readBinary: async () => {
      throw new Error('unused in this test');
    },
    writeBinary,
  };
}

describe('the offline preflight', () => {
  it('refuses with a stated reason, never calls render(), and writes 0 capture files', async () => {
    const renderCalled = vi.fn(async () => ({ captures: [] }));
    const renderer: Renderer = {
      checkEgress: async () => false,
      render: renderCalled,
    };
    const writeBinary = vi.fn(async () => {});
    const fs = stubFs(writeBinary);
    const ctx: KernelContext = { cwd: '/project', fs, render: renderer };

    await expect(
      renderDesign(
        { location: '/project/design-export/index.html', destDir: 'specs/106-visual-render/visual/renders' },
        ctx,
      ),
    ).rejects.toThrow(/egress|network|reachable/i);

    // FR-005's literal "before executing any artboard": render() was never
    // reached, and nothing was written.
    expect(renderCalled).not.toHaveBeenCalled();
    expect(writeBinary).not.toHaveBeenCalled();
  });

  it('consults checkEgress() itself, rather than short-circuiting some other way', async () => {
    const checkEgress = vi.fn(async () => false);
    const renderer: Renderer = { checkEgress, render: vi.fn(async () => ({ captures: [] })) };
    const ctx: KernelContext = { cwd: '/project', fs: stubFs(), render: renderer };

    await expect(
      renderDesign(
        { location: '/project/design-export/index.html', destDir: 'specs/106-visual-render/visual/renders' },
        ctx,
      ),
    ).rejects.toThrow();

    expect(checkEgress).toHaveBeenCalledTimes(1);
  });
});

describe('the template guard', () => {
  it('refuses an artboard whose label still carries template syntax, without writing it, even when egress is reachable', async () => {
    const templateLabel = '{{ s.id }} · light';
    const realLabel = 'no-rate · light';

    // checkEgress() truthfully reports the CDN is reachable — the T-100
    // preflight would let this run proceed. The spike behind design D-001
    // is exactly this: a blocked CDN yielded four labels that still read
    // like `{{ s.id }} · light` rather than the runtime throwing, so a
    // healthy-looking egress check is not enough on its own.
    const renderer: Renderer = {
      checkEgress: async () => true,
      render: async () => ({
        captures: [
          { label: templateLabel, bytes: new Uint8Array([1, 2, 3]), consoleErrors: [] },
          { label: realLabel, bytes: new Uint8Array([4, 5, 6]), consoleErrors: [] },
        ],
      }),
    };

    const writeBinary = vi.fn(async () => {});
    const fs = stubFs(writeBinary);
    const ctx: KernelContext = { cwd: '/project', fs, render: renderer };

    const result = await renderDesign(
      { location: '/project/design-export/index.html', destDir: 'specs/106-visual-render/visual/renders' },
      ctx,
    );

    // Guard: the template-labelled artboard is refused — it is never written
    // to disk. Exactly one write happens, and it is for the real label.
    expect(writeBinary).toHaveBeenCalledTimes(1);
    const [writtenPath, writtenBytes] = writeBinary.mock.calls[0]!;
    expect(String(writtenPath)).not.toMatch(/\{\{|\}\}/);
    expect(String(writtenPath)).toMatch(/no-rate/);
    expect(Array.from(writtenBytes as Uint8Array)).toEqual([4, 5, 6]);

    // Reported rather than silently dropped — accounted for as not-captured
    // with a reason naming the template, not merely absent.
    const refused = (result as { refused?: Array<{ label: string; reason: string }> }).refused ?? [];
    const templateEntry = refused.find((e) => e.label === templateLabel);
    expect(templateEntry).toBeDefined();
    expect(templateEntry?.reason.toLowerCase()).toContain('template');

    // Per-artboard, not whole-run: the SAME run's real-labelled capture was
    // already written above (writeBinary called once, for "no-rate") —
    // unlike T-100's egress refusal, which discards everything before a
    // single artboard is opened.
  });
});
