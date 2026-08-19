import { describe, expect, it } from 'vitest';
import { readBriefModel } from '../src/visual/brief-read.js';
import type { FileSystem } from '../src/types.js';

/**
 * The complete reader (107-visual-design-brief, T-100, FR-001).
 *
 * `projectScreens` (materialise-view.ts) is deliberately not reused here — it
 * takes a `rowBudget` and truncates, and its `ProjectedScreen` carries no
 * refusal, no annotation `aria-state`/`cites`, and no addressed/declined
 * contexts. FR-001 requires every declared state, refusal, annotation and
 * context to reach the brief, so a truncating model cannot be the source.
 * `readBriefModel` is its own reader, following the precedent
 * `screen-naming.ts:83-85` already set: read declarations directly rather
 * than widen the view's model, which keeps the view's shape owned by the
 * view (design.html D-004).
 *
 * Screens are read the same way `materialise-view.ts`/`screen-naming.ts`
 * already do: every `.html` file under the design's declared `screens=`
 * directory, not just one.
 */

function stubFs(files: Record<string, string>): FileSystem {
  return {
    readFile: async (path: string) => {
      const key = path.replace(/^\/project\//, '');
      if (!(key in files)) throw new Error(`ENOENT: ${path}`);
      return files[key]!;
    },
    writeFile: async () => {
      throw new Error('unused in this test');
    },
    readdir: async (path: string) => {
      const prefix = `${path.replace(/^\/project\//, '')}/`;
      const names = new Set<string>();
      for (const key of Object.keys(files)) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          if (!rest.includes('/')) names.add(rest);
        }
      }
      if (names.size === 0) throw new Error(`ENOENT: ${path}`);
      return [...names];
    },
    stat: async (path: string) => {
      const key = path.replace(/^\/project\//, '');
      if (key in files) return { isDirectory: false };
      const prefix = `${key}/`;
      if (Object.keys(files).some((k) => k.startsWith(prefix))) return { isDirectory: true };
      throw new Error(`ENOENT: ${path}`);
    },
    rename: async () => {},
    rm: async () => {},
    mkdir: async () => {},
    readBinary: async () => {
      throw new Error('unused in this test');
    },
    writeBinary: async () => {
      throw new Error('unused in this test');
    },
  };
}

const DESIGN_ONE_SCREEN_DIR = `
<spec-visual shape="screens" screens="specs/001-example/visual" variants="visual/variants.html"
  addresses="convert" contexts="mode=light mode=dark platform=ios"></spec-visual>
`;

const SCREEN_HTML = `
<spec-screen id="convert" name="convert">
  <spec-state id="empty" source="authored">
    <spec-annotation target="amount-field" layer="behaviour" role="textbox" aria-state="required"></spec-annotation>
  </spec-state>
  <spec-state id="loading" source="authored"></spec-state>
  <spec-state id="converted" source="derived" from="200">
    <spec-annotation target="rate-line" layer="requirement" cites="NFR-001"></spec-annotation>
  </spec-state>
</spec-screen>

<spec-refusal text="Something went wrong">It names no cause and offers no action.</spec-refusal>
<spec-refusal text="Error" context="anything a user reads">Fine in a log line, useless on screen.</spec-refusal>
`;

const VARIANTS_HTML = `
<spec-variant-grid>
  <spec-axis name="mode" default="light" selects="values">
    <spec-context name="light"></spec-context>
    <spec-context name="dark"></spec-context>
  </spec-axis>
  <spec-axis name="platform" default="ios" selects="interaction">
    <spec-context name="ios"></spec-context>
    <spec-context name="tvos" declined>
      <p>A converter is read once; a remote is worse than useless for it.</p>
    </spec-context>
  </spec-axis>
</spec-variant-grid>
`;

describe('readBriefModel (107 FR-001)', () => {
  it('reads every declared state, with its source and from, across a screens directory', async () => {
    const fs = stubFs({
      'specs/001-example/design.html': DESIGN_ONE_SCREEN_DIR,
      'specs/001-example/visual/convert.screen.html': SCREEN_HTML,
      'visual/variants.html': VARIANTS_HTML,
    });
    const model = await readBriefModel(DESIGN_ONE_SCREEN_DIR, fs, '/project');

    expect(model.screens).toHaveLength(1);
    const screen = model.screens[0]!;
    expect(screen.id).toBe('convert');
    expect(screen.states.map((s) => s.id)).toEqual(['empty', 'loading', 'converted']);
    expect(screen.states[0]).toEqual({ id: 'empty', source: 'authored', from: undefined });
    expect(screen.states[2]).toEqual({ id: 'converted', source: 'derived', from: '200' });
  });

  it('reads every annotation, including aria-state and cites', async () => {
    const fs = stubFs({
      'specs/001-example/design.html': DESIGN_ONE_SCREEN_DIR,
      'specs/001-example/visual/convert.screen.html': SCREEN_HTML,
      'visual/variants.html': VARIANTS_HTML,
    });
    const model = await readBriefModel(DESIGN_ONE_SCREEN_DIR, fs, '/project');

    const screen = model.screens[0]!;
    expect(screen.annotations).toHaveLength(2);
    expect(screen.annotations[0]).toEqual({
      target: 'amount-field',
      layer: 'behaviour',
      role: 'textbox',
      ariaState: 'required',
      cites: undefined,
    });
    expect(screen.annotations[1]).toEqual({
      target: 'rate-line',
      layer: 'requirement',
      role: undefined,
      ariaState: undefined,
      cites: 'NFR-001',
    });
  });

  it('reads every refusal, document-scoped rather than nested under a screen', async () => {
    const fs = stubFs({
      'specs/001-example/design.html': DESIGN_ONE_SCREEN_DIR,
      'specs/001-example/visual/convert.screen.html': SCREEN_HTML,
      'visual/variants.html': VARIANTS_HTML,
    });
    const model = await readBriefModel(DESIGN_ONE_SCREEN_DIR, fs, '/project');

    expect(model.refusals).toHaveLength(2);
    expect(model.refusals[0]).toEqual({
      text: 'Something went wrong',
      context: undefined,
      body: 'It names no cause and offers no action.',
    });
    expect(model.refusals[1]).toEqual({
      text: 'Error',
      context: 'anything a user reads',
      body: 'Fine in a log line, useless on screen.',
    });
  });

  it('reads the addressed contexts and every declined context with its reason', async () => {
    const fs = stubFs({
      'specs/001-example/design.html': DESIGN_ONE_SCREEN_DIR,
      'specs/001-example/visual/convert.screen.html': SCREEN_HTML,
      'visual/variants.html': VARIANTS_HTML,
    });
    const model = await readBriefModel(DESIGN_ONE_SCREEN_DIR, fs, '/project');

    expect(model.addressedContexts).toEqual(['mode=light', 'mode=dark', 'platform=ios']);
    expect(model.declinedContexts).toEqual([
      { axis: 'platform', context: 'tvos', reason: 'A converter is read once; a remote is worse than useless for it.' },
    ]);
  });

  it('reads every screen file in the declared directory, not just one', async () => {
    const twoScreenDesign = `<spec-visual shape="screens" screens="specs/002-example/visual"></spec-visual>`;
    const fs = stubFs({
      'specs/002-example/visual/a.screen.html': `<spec-screen id="a"><spec-state id="s1" source="authored"></spec-state></spec-screen>`,
      'specs/002-example/visual/b.screen.html': `<spec-screen id="b"><spec-state id="s2" source="authored"></spec-state></spec-screen>`,
    });
    const model = await readBriefModel(twoScreenDesign, fs, '/project');

    expect(model.screens.map((s) => s.id).sort()).toEqual(['a', 'b']);
  });

  it('returns empty contexts and declined lists when the design declares no variants grid', async () => {
    const noVariantsDesign = `<spec-visual shape="screens" screens="specs/003-example/visual"></spec-visual>`;
    const fs = stubFs({
      'specs/003-example/visual/only.screen.html': `<spec-screen id="only"></spec-screen>`,
    });
    const model = await readBriefModel(noVariantsDesign, fs, '/project');

    expect(model.addressedContexts).toEqual([]);
    expect(model.declinedContexts).toEqual([]);
  });

  it('collapses source-line-wrap whitespace in refusal bodies and declined reasons — a brief pasted elsewhere must not carry a mid-sentence break', async () => {
    const design = `<spec-visual shape="screens" screens="specs/004-example/visual" variants="visual/variants.html"></spec-visual>`;
    const wrappedScreen = `
<spec-refusal text="Error">Fine in a log line and useless on screen. Scoped
rather than blanket, because the word is not the problem — the placement is.</spec-refusal>
`;
    const wrappedVariants = `
<spec-variant-grid>
  <spec-axis name="platform" default="ios" selects="interaction">
    <spec-context name="tvos" declined>
      <p>A converter is entered a digit at a time and read once. On a focus-engine remote that is worse than
      useless, and nobody asked for it.</p>
    </spec-context>
  </spec-axis>
</spec-variant-grid>
`;
    const fs = stubFs({
      'specs/004-example/visual/only.screen.html': wrappedScreen,
      'visual/variants.html': wrappedVariants,
    });
    const model = await readBriefModel(design, fs, '/project');

    expect(model.refusals[0]!.body).toBe(
      'Fine in a log line and useless on screen. Scoped rather than blanket, because the word is not the problem — the placement is.',
    );
    expect(model.declinedContexts[0]!.reason).toBe(
      'A converter is entered a digit at a time and read once. On a focus-engine remote that is worse than useless, and nobody asked for it.',
    );
  });
});
