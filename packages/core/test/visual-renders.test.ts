import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BASE_ENTRIES, ECOSYSTEM_IGNORES } from '../src/gitignore/entries.js';

/**
 * Two guards over requirements that are already true (spec
 * 094-visual-sidecar-convention, FR-005/FR-006, design D-003/D-004).
 *
 * Both are the shape of requirement that is easiest to satisfy today and lose
 * next quarter, because nothing fails when someone violates them. A prohibition
 * with no test is a sentence; the distance between "true today" and "guaranteed"
 * is exactly the distance P-8 cares about.
 */

const HERE = fileURLToPath(import.meta.url);
const REPO = HERE.slice(0, HERE.indexOf('/packages/core/'));

/** Every module that participates in a visual check. */
const VISUAL_CHECK_MODULES = [
  'packages/core/src/visual/read.ts',
  'packages/core/src/visual/location.ts',
  'packages/schema/src/visual-shared.ts',
  'packages/schema/src/rules/visual-declaration-shape.ts',
];

describe('FR-005 · a render is evidence, never load-bearing', () => {
  it('no visual check module names an image extension', () => {
    // A proxy, and stated as one in D-003: someone could depend on an image
    // without naming an extension. It raises the cost of the mistake rather
    // than making it impossible.
    for (const rel of VISUAL_CHECK_MODULES) {
      const src = readFileSync(join(REPO, rel), 'utf8');
      expect(src, rel).not.toMatch(/\.(png|jpe?g|webp|gif|avif|heic)\b/i);
    }
  });

  it('no visual check module reaches for a renders or images directory', () => {
    for (const rel of VISUAL_CHECK_MODULES) {
      const src = readFileSync(join(REPO, rel), 'utf8');
      expect(src, rel).not.toMatch(/['"`][^'"`]*\/(renders?|images?|screenshots?)\//i);
    }
  });

  it('a project declaring visuals with zero renders produces no finding about their absence', async () => {
    const { visualResolveFindings, visualLocationFindings } = await import('../src/commands/validate.js');
    const { readVisualDeclarations } = await import('@spectastic/schema/visual');
    const { nodeFs } = await import('../src/providers/node-fs.js');
    const { mkdirSync, mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');

    const root = mkdtempSync(join(tmpdir(), 'spectastic-094-norenders-'));
    mkdirSync(join(root, 'visual', 'tokens'), { recursive: true });
    mkdirSync(join(root, 'specs', '001-a', 'visual'), { recursive: true });

    const file = 'specs/001-a/design.html';
    const html = `<spec-visual shape="screens" tokens="visual/tokens" screens="specs/001-a/visual" source="hand-authored"><p>r</p></spec-visual>`;
    const decls = readVisualDeclarations(html, file);

    expect(await visualResolveFindings(decls, file, nodeFs, root)).toEqual([]);
    expect(visualLocationFindings(decls, file)).toEqual([]);
  });
});

describe('FR-006 · the scaffolded ignore rules exclude neither directory', () => {
  const ALL = [...BASE_ENTRIES, ...Object.values(ECOSYSTEM_IGNORES).flat()];

  it('no scaffolded entry names an image pattern at all', () => {
    for (const entry of ALL) {
      expect(entry, entry).not.toMatch(/\.(png|jpe?g|webp|gif|avif|heic|svg)\b/i);
    }
  });

  it('no scaffolded entry would exclude a file under either visual directory', () => {
    // Deliberately literal rather than a gitignore-semantics simulation: the
    // property worth guarding is that nothing in the managed block mentions
    // these paths, which is stronger and does not depend on a matcher.
    for (const entry of ALL) {
      expect(entry, entry).not.toMatch(/(^|\/)visual(\/|$)/);
    }
  });

  it("this repository's own image rule is root-anchored, which is the spec's third edge case", () => {
    // Not a spectastic entry, but the evidence the edge case is real and
    // already benign here: a leading slash confines it to the root.
    const gitignore = readFileSync(join(REPO, '.gitignore'), 'utf8');
    const imageRules = gitignore.split('\n').filter((l) => /\.(png|jpe?g|gif|webp)\s*$/.test(l.trim()));
    expect(imageRules.length).toBeGreaterThan(0);
    for (const rule of imageRules) expect(rule.trim().startsWith('/'), rule).toBe(true);
  });
});
