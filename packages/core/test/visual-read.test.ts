import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { declaredVisualState, userInterfaceState } from '../src/visual/read.js';

/**
 * The accumulating reader for `<spec-visual>` (spec 093-design-visual-section,
 * FR-004/FR-005/FR-006).
 *
 * Cloned from `declaredInterfaceState` deliberately, including the bug it was
 * fixed for: declarations ACCUMULATE across designs rather than shadowing, so a
 * later feature declaring `shape="none"` cannot silently void an earlier
 * design's declaration that the project has a surface. Superseding a spec
 * retires what it declared, at both ends.
 */

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-visual-read-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
  return dir;
}

function designDeclaring(tokens: string, screens: string, status = 'accepted'): string {
  return `<!doctype html><html><body>
<spec-status value="${status}">${status}</spec-status>
<spec-visual shape="screens" tokens="${tokens}" screens="${screens}" source="figma"><p>reasoning</p></spec-visual>
</body></html>`;
}

function designDeclaringNone(status = 'accepted'): string {
  return `<!doctype html><html><body>
<spec-status value="${status}">${status}</spec-status>
<spec-visual shape="none"><p>This feature touches no screen.</p></spec-visual>
</body></html>`;
}

describe('reading one design', () => {
  it('reads every declared attribute', () => {
    const dir = fixture({ 'specs/001-a/design.html': designDeclaring('visual/tokens', 'specs/001-a/visual') });
    const state = declaredVisualState(dir);
    expect(state).not.toBeNull();
    expect(state?.declaredPaths.map((p) => p.path)).toEqual(['visual/tokens', 'specs/001-a/visual']);
    expect(state?.declaredPaths[0]?.specId).toBe('001-a');
    expect(state?.declaresNoSurface).toBe(false);
    expect(state?.populatedSpecs).toEqual(['001-a']);
  });

  it('records an explicit none as a declaration that names no path', () => {
    const dir = fixture({ 'specs/001-a/design.html': designDeclaringNone() });
    const state = declaredVisualState(dir);
    expect(state?.declaredPaths).toEqual([]);
    expect(state?.declaresNoSurface).toBe(true);
    expect(state?.populatedSpecs).toEqual([]);
  });

  it('returns null when no design carries a declaration at all', () => {
    const dir = fixture({ 'specs/001-a/design.html': '<!doctype html><html><body><p>nothing</p></body></html>' });
    expect(declaredVisualState(dir)).toBeNull();
  });

  it('returns null when the project has no specs directory', () => {
    expect(declaredVisualState(fixture({ 'package.json': '{}' }))).toBeNull();
  });
});

describe('malformed input degrades rather than throwing', () => {
  it('treats an unclosed declaration as declaring nothing rather than crashing', () => {
    const dir = fixture({ 'specs/001-a/design.html': '<spec-visual shape="screens" tokens="visual/tokens"' });
    expect(() => declaredVisualState(dir)).not.toThrow();
    expect(declaredVisualState(dir)).toBeNull();
  });

  it('keeps a declaration whose shape is unrecognised — validating it is the rule’s job', () => {
    const dir = fixture({
      'specs/001-a/design.html': '<spec-visual shape="banana" tokens="visual/tokens"><p>x</p></spec-visual>',
    });
    const state = declaredVisualState(dir);
    expect(state?.declaredPaths.map((p) => p.path)).toEqual(['visual/tokens']);
    expect(state?.declaresNoSurface).toBe(false);
  });
});

describe('declarations accumulate rather than shadow', () => {
  it('a later none does NOT void an earlier declaration of a surface', () => {
    const dir = fixture({
      'specs/001-a/design.html': designDeclaring('visual/tokens', 'specs/001-a/visual'),
      'specs/002-b/design.html': designDeclaringNone(),
    });
    const state = declaredVisualState(dir);
    expect(state?.declaresNoSurface).toBe(false);
    expect(state?.declaredPaths.map((p) => p.path)).toContain('visual/tokens');
  });

  it('unions paths across designs, tagged with the spec that declared each', () => {
    const dir = fixture({
      'specs/001-a/design.html': designDeclaring('visual/tokens', 'specs/001-a/visual'),
      'specs/002-b/design.html': designDeclaring('visual/tokens', 'specs/002-b/visual'),
    });
    const state = declaredVisualState(dir);
    expect(state?.populatedSpecs).toEqual(['001-a', '002-b']);
    expect(state?.declaredPaths.filter((p) => p.path === 'specs/002-b/visual')[0]?.specId).toBe('002-b');
  });

  it('reports every design that carries a populated section, which is what the gate reads', () => {
    const dir = fixture({
      'specs/001-a/design.html': designDeclaringNone(),
      'specs/002-b/design.html': designDeclaring('visual/tokens', 'specs/002-b/visual'),
    });
    expect(declaredVisualState(dir)?.populatedSpecs).toEqual(['002-b']);
  });
});

describe('a retired spec contributes nothing', () => {
  it('drops a superseded design’s declarations entirely', () => {
    const dir = fixture({
      'specs/001-a/design.html': designDeclaring('visual/tokens', 'specs/001-a/visual', 'superseded'),
    });
    expect(declaredVisualState(dir)).toBeNull();
  });

  it('drops a deprecated design’s declarations entirely', () => {
    const dir = fixture({
      'specs/001-a/design.html': designDeclaring('visual/tokens', 'specs/001-a/visual', 'deprecated'),
      'specs/002-b/design.html': designDeclaringNone(),
    });
    const state = declaredVisualState(dir);
    expect(state?.declaredPaths).toEqual([]);
    expect(state?.declaresNoSurface).toBe(true);
  });
});

describe('provenance is carried but never resolved', () => {
  it('keeps source= as a value and makes no attempt to reach it', () => {
    const dir = fixture({
      'specs/001-a/design.html': `<spec-visual shape="screens" tokens="visual/tokens" screens="specs/001-a/visual" source="https://figma.com/file/gone"><p>x</p></spec-visual>`,
    });
    expect(() => declaredVisualState(dir)).not.toThrow();
    expect(declaredVisualState(dir)?.sources).toEqual(['https://figma.com/file/gone']);
  });
});

describe('a declaration outranks detection in both directions (FR-004)', () => {
  it('a declared surface stands where nothing was detected', () => {
    const dir = fixture({
      'package.json': '{"dependencies":{"lodash":"^4"}}',
      'specs/001-a/design.html': designDeclaring('visual/tokens', 'specs/001-a/visual'),
    });
    const state = userInterfaceState(dir);
    expect(state.hasInterface).toBe(true);
    expect(state.basis).toBe('declared');
    // Detection still ran and still reports what it saw — it is overridden,
    // never switched off.
    expect(state.detected).toBe(false);
  });

  it('a declared none stands where something WAS detected', () => {
    const dir = fixture({
      'package.json': '{"dependencies":{"react":"^19"}}',
      'specs/001-a/design.html': designDeclaringNone(),
    });
    const state = userInterfaceState(dir);
    expect(state.hasInterface).toBe(false);
    expect(state.basis).toBe('declared');
    expect(state.detected).toBe(true);
  });

  it('falls back to detection where nothing is declared', () => {
    const dir = fixture({ 'package.json': '{"dependencies":{"react":"^19"}}' });
    const state = userInterfaceState(dir);
    expect(state.hasInterface).toBe(true);
    expect(state.basis).toBe('detected');
  });

  it('reports no interface where nothing is declared and nothing detected', () => {
    const dir = fixture({ 'package.json': '{"dependencies":{"lodash":"^4"}}' });
    const state = userInterfaceState(dir);
    expect(state.hasInterface).toBe(false);
    expect(state.basis).toBe('absent');
  });

  it('runs detection even when a declaration will override it, so a project cannot go quiet', () => {
    const dir = fixture({
      'package.json': '{"dependencies":{"vue":"^3"}}',
      'specs/001-a/design.html': designDeclaringNone(),
    });
    expect(userInterfaceState(dir).signals).toEqual(['package.json:"vue"']);
  });
});
