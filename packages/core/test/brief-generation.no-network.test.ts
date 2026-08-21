import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Three structural negatives (107-visual-design-brief, T-102, FR-010, NFR-001,
 * FR-011's testable half).
 *
 * Checked at the source-text level, like 106's own
 * `render.no-comparison.test.ts` — meant to fail loudly if someone later
 * reaches for `fetch`/`http`/a design-tool name, not to be a sophisticated
 * static analyzer.
 *
 * FR-011's own guarantee ("MUST NOT be read back by any verb as a source of
 * declarations") is otherwise an absence-of-a-reader property with nothing
 * positive to assert against — design.html D-002's Consequences already
 * records this as conventional rather than structural. What IS testable
 * today is that every existing visual-material reader stays that way: none
 * of them is taught to glob `visual/briefs/` or a `.md` file.
 */

const READER_SOURCES = [
  new URL('../src/visual/materialise-view.ts', import.meta.url),
  new URL('../src/visual/screen-naming.ts', import.meta.url),
  new URL('../src/visual/coverage.ts', import.meta.url),
  new URL('../src/visual/import.ts', import.meta.url),
];

const RENDER_SOURCE = new URL('../src/visual/brief-render.ts', import.meta.url);

describe('brief generation — no design tool named, no network (107 FR-010, NFR-001)', () => {
  it('names no design tool by product name', () => {
    const source = readFileSync(RENDER_SOURCE, 'utf8');
    expect(source).not.toMatch(/figma|sketch|penpot|stitch|claude design/i);
  });

  it('imports nothing that reaches the network', () => {
    const source = readFileSync(RENDER_SOURCE, 'utf8');
    expect(source).not.toMatch(/\bfetch\(|node:https?|node:net\b|undici/i);
  });
});

describe('brief generation — never read back as a source of declarations (107 FR-011)', () => {
  it('no existing visual-material reader names visual/briefs as a path to read', () => {
    for (const url of READER_SOURCES) {
      const source = readFileSync(url, 'utf8');
      expect(source, url.pathname).not.toMatch(/visual\/briefs/);
    }
  });

  it('the two directory scanners still filter to .html only — a widened filter is exactly how a brief would start being read as a screen', () => {
    const materialiseView = readFileSync(READER_SOURCES[0]!, 'utf8');
    const screenNaming = readFileSync(READER_SOURCES[1]!, 'utf8');
    expect(materialiseView).toMatch(/endsWith\(['"]\.html['"]\)/);
    expect(screenNaming).toMatch(/endsWith\(['"]\.html['"]\)/);
  });
});
