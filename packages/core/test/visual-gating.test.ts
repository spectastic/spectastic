import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { visualSectionGatedFindings } from '../src/commands/validate.js';
import { projectHasVisualSurface } from '../src/visual/read.js';

/**
 * The gating check (spec 093-design-visual-section, FR-002 / SC-002):
 * absence, not emptiness.
 *
 * The failure this exists to stop is the one 37 verify views already
 * demonstrate — a section seeded into every project, 77 gap rows, and not one
 * of them ever answerable. `templates/` is copied verbatim and cannot vary per
 * project, so the guarantee has to live over the authored artifact.
 *
 * Writing this exposed a subtlety FR-002's wording hides. "No detected AND no
 * declared interface" cannot mean the declaration in the document being judged,
 * or the rule would be self-defeating: a populated section IS a declaration, so
 * it would always suppress its own gate. What the gate actually catches is the
 * scaffold nobody deleted — a section whose declaration is still the template's
 * own `[PLACEHOLDER]`, which declares nothing at all.
 */

const FILE = 'specs/001-a/design.html';

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'spectastic-visual-gate-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
  return root;
}

const SCAFFOLD = `<!doctype html><html><body>
<section id="visual"><h2>4 · Visual surface</h2>
<spec-visual shape="[SHAPE]" tokens="[TOKEN_SET_PATH]" screens="[SCREENS_PATH]" source="[WHERE_THE_DESIGN_CAME_FROM]">
<p>[REASONING]</p></spec-visual></section>
</body></html>`;

const DECLARED = `<!doctype html><html><body>
<section id="visual"><h2>4 · Visual surface</h2>
<spec-visual shape="screens" tokens="visual/tokens" screens="specs/001-a/visual" source="figma"><p>r</p></spec-visual>
</section></body></html>`;

const DECLARED_NONE = `<!doctype html><html><body>
<section id="visual"><h2>4 · Visual surface</h2>
<spec-visual shape="none"><p>no screen</p></spec-visual></section>
</body></html>`;

const DELETED = '<!doctype html><html><body><section id="grounding"><h2>4 · Grounding</h2></section></body></html>';

const UI_MANIFEST = '{"dependencies":{"react":"^19"}}';
const NO_UI_MANIFEST = '{"dependencies":{"lodash":"^4"}}';

describe('a project with no user interface', () => {
  it('flags a scaffold nobody deleted — the whole point of the gate', () => {
    const root = project({ 'package.json': NO_UI_MANIFEST, [FILE]: SCAFFOLD });
    const f = visualSectionGatedFindings(SCAFFOLD, FILE, projectHasVisualSurface(root));
    expect(f).toHaveLength(1);
    expect(f[0]?.severity).toBe('error');
    expect(f[0]?.message).toMatch(/no user interface/i);
    expect(f[0]?.fixHint).toMatch(/delete/i);
  });

  it('reports NOTHING for a design that deleted the section — absence is silent', () => {
    const root = project({ 'package.json': NO_UI_MANIFEST, [FILE]: DELETED });
    expect(visualSectionGatedFindings(DELETED, FILE, projectHasVisualSurface(root))).toEqual([]);
  });

  it('flags an explicit none, because the section itself does not belong here', () => {
    // FR-007 scopes the explicit-none form to "a section the gate admits". In a
    // project with no interface the gate admits nothing, so a considered "none"
    // is still a section that should not exist.
    const root = project({ 'package.json': NO_UI_MANIFEST, [FILE]: DECLARED_NONE });
    expect(visualSectionGatedFindings(DECLARED_NONE, FILE, projectHasVisualSurface(root))).toHaveLength(1);
  });

  it('does NOT flag a genuinely declared surface — the hand-rolled-UI escape hatch (FR-004)', () => {
    const root = project({ 'package.json': NO_UI_MANIFEST, [FILE]: DECLARED });
    expect(visualSectionGatedFindings(DECLARED, FILE, projectHasVisualSurface(root))).toEqual([]);
  });
});

describe('a project with a user interface', () => {
  it('reports nothing for a declared surface', () => {
    const root = project({ 'package.json': UI_MANIFEST, [FILE]: DECLARED });
    expect(visualSectionGatedFindings(DECLARED, FILE, projectHasVisualSurface(root))).toEqual([]);
  });

  it('reports nothing for an explicit none — the section legitimately exists here', () => {
    const root = project({ 'package.json': UI_MANIFEST, [FILE]: DECLARED_NONE });
    expect(visualSectionGatedFindings(DECLARED_NONE, FILE, projectHasVisualSurface(root))).toEqual([]);
  });

  it('reports nothing for an unfilled scaffold — incomplete, but not this rule’s business', () => {
    const root = project({ 'package.json': UI_MANIFEST, [FILE]: SCAFFOLD });
    expect(visualSectionGatedFindings(SCAFFOLD, FILE, projectHasVisualSurface(root))).toEqual([]);
  });
});

describe('an unfilled scaffold declares nothing', () => {
  it('does not let a placeholder shape read as a declared surface', () => {
    const root = project({ 'package.json': NO_UI_MANIFEST, [FILE]: SCAFFOLD });
    expect(projectHasVisualSurface(root)).toBe(false);
  });

  it('does not let a placeholder read as a declared NONE either, which would silence detection', () => {
    // The dangerous direction: a React project whose scaffold is unfilled must
    // not read as "this project declares it has no surface".
    const root = project({ 'package.json': UI_MANIFEST, [FILE]: SCAFFOLD });
    expect(projectHasVisualSurface(root)).toBe(true);
  });
});
