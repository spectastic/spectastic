import { describe, expect, it } from 'vitest';
import { materialiseVisualViews, projectScreens, renderView } from '../src/visual/materialise-view.js';
import type { FileSystem } from '../src/types.js';

/**
 * `materialiseVisualViews` (099-visual-embedded-view).
 *
 * The three properties that carry the feature: it DERIVES rather than copies
 * (FR-002), it is idempotent (FR-007), and it writes no view at all when it
 * cannot read the source (FR-010) — never an empty one, which would read as
 * "there is nothing there" and be a different, false claim.
 */

const SCREEN = `<!doctype html><html><body><main>
<spec-screen id="convert">
  <spec-state id="empty" source="authored"></spec-state>
  <spec-state id="converted" source="derived" from="200">
    <spec-annotation target="rate-line" layer="structure" role="status"><p>x</p></spec-annotation>
    <spec-render src="renders/converted-ios-light.png" contexts="platform=ios mode=light"></spec-render>
  </spec-state>
  <spec-state id="invalid-pair" source="derived" from="400 404 422"></spec-state>
</spec-screen>
</main></body></html>`;

const DESIGN = (extra = '') => `<!doctype html><html><body><main>
<spec-visual shape="screens" tokens="visual/tokens" screens="specs/001-a/visual/x.screen.html" source="figma">
  <p>authored reasoning that must survive</p>${extra}
</spec-visual>
</main></body></html>`;

function fsWith(files: Record<string, string>, dirs: string[] = []): FileSystem {
  return {
    readFile: async (p: string) => {
      const hit = Object.entries(files).find(([k]) => p.endsWith(k));
      if (!hit) throw new Error(`ENOENT ${p}`);
      return hit[1];
    },
    writeFile: async () => {},
    stat: async (p: string) => {
      if (dirs.some((d) => p.endsWith(d))) return { isFile: false, isDirectory: true };
      if (Object.keys(files).some((k) => p.endsWith(k))) return { isFile: true, isDirectory: false };
      throw new Error(`ENOENT ${p}`);
    },
    readdir: async () => Object.keys(files).map((k) => k.split('/').pop() as string),
    rename: async () => {},
    mkdir: async () => {},
  } as unknown as FileSystem;
}

describe('projection', () => {
  it('derives states with their source and origin rather than copying markup', () => {
    const m = projectScreens(SCREEN);
    expect(m.screens).toHaveLength(1);
    expect(m.screens[0]?.states.map((s) => s.id)).toEqual(['empty', 'converted', 'invalid-pair']);
    expect(m.screens[0]?.states[2]?.from).toBe('400 404 422');
  });

  it('carries the annotation subject and layer through', () => {
    const [screen] = projectScreens(SCREEN).screens;
    expect(screen?.annotations[0]).toMatchObject({ target: 'rate-line', layer: 'structure' });
  });

  it('binds a render to the state it sits in, from position rather than an attribute', () => {
    const [screen] = projectScreens(SCREEN).screens;
    expect(screen?.renders[0]).toMatchObject({ state: 'converted', contexts: { platform: 'ios', mode: 'light' } });
  });

  it('truncates against a row budget and says that it did', () => {
    const m = projectScreens(SCREEN, 'screen.html', 2);
    expect(m.truncated).toBe(true);
    expect(m.screens[0]?.states).toHaveLength(2);
  });
});

describe('rendering', () => {
  it('references a render and never embeds it', () => {
    const html = renderView(projectScreens(SCREEN));
    expect(html).toContain('<img src="renders/converted-ios-light.png"');
    expect(html).not.toContain('data:');
  });

  it('gives the image alternative text derived from what it is evidence of', () => {
    const html = renderView(projectScreens(SCREEN));
    expect(html).toMatch(/alt="convert screen in the converted state \(platform ios, mode light\)"/);
  });

  it('escapes projected text, since a sidecar is untrusted from here', () => {
    const hostile = SCREEN.replace('id="empty"', 'id="&lt;script&gt;"');
    expect(renderView(projectScreens(hostile))).not.toContain('<script>');
  });
});

describe('injection', () => {
  it('writes a view into the declaration and keeps the authored prose', async () => {
    const out = await materialiseVisualViews(DESIGN(), fsWith({ 'x.screen.html': SCREEN }), '/repo');
    expect(out).toContain('<spec-visual-view');
    expect(out).toContain('authored reasoning that must survive');
  });

  it('is idempotent — a second run replaces rather than appends', async () => {
    const fs = fsWith({ 'x.screen.html': SCREEN });
    const once = await materialiseVisualViews(DESIGN(), fs, '/repo');
    const twice = await materialiseVisualViews(once, fs, '/repo');
    expect(twice).toBe(once);
    expect(twice.match(/<spec-visual-view/g)).toHaveLength(1);
  });

  it('writes no view at all when the sidecar cannot be read, rather than an empty one', async () => {
    const out = await materialiseVisualViews(DESIGN(), fsWith({}), '/repo');
    expect(out).not.toContain('<spec-visual-view');
    expect(out).toContain('authored reasoning that must survive');
  });

  it('leaves a declaration naming no screens untouched', async () => {
    const none =
      '<!doctype html><html><body><main><spec-visual shape="none"><p>r</p></spec-visual></main></body></html>';
    expect(await materialiseVisualViews(none, fsWith({}), '/repo')).toBe(none);
  });

  it('leaves a document with no declaration untouched', async () => {
    const plain = '<!doctype html><html><body><main><p>an ordinary design</p></main></body></html>';
    expect(await materialiseVisualViews(plain, fsWith({}), '/repo')).toBe(plain);
  });
});
