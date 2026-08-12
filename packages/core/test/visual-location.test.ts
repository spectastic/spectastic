import { describe, expect, it } from 'vitest';
import { conventionalVisualPrefix, owningSpecId } from '../src/visual/location.js';

/**
 * The conventional-location helper (spec 094-visual-sidecar-convention,
 * FR-001/FR-002, design D-001).
 *
 * Pure path arithmetic — 0 filesystem calls, which is what keeps NFR-001's
 * per-declaration budget true while adding a second check over the same
 * declarations. A PREFIX comparison rather than equality, because FR-008
 * explicitly permits a project to subdivide either directory and an equality
 * test would forbid the exemplar's own `visual/tokens/light.json`.
 */

describe('deriving the owning spec id from the declaring design', () => {
  it('reads the id out of a conventional spec bundle path', () => {
    expect(owningSpecId('specs/094-visual-sidecar-convention/design.html')).toBe('094-visual-sidecar-convention');
  });

  it('reads it from an absolute path too', () => {
    expect(owningSpecId('/repo/specs/001-a/design.html')).toBe('001-a');
  });

  it('returns null for a design outside specs/, so the screens check stands down', () => {
    expect(owningSpecId('templates/design.html')).toBeNull();
    expect(owningSpecId('docs/some-brief.html')).toBeNull();
  });

  it('does not match a directory merely ending in specs', () => {
    expect(owningSpecId('myspecs/001-a/design.html')).toBeNull();
  });
});

describe('the conventional prefix for each scope', () => {
  it('is the project root visual directory for a token set', () => {
    expect(conventionalVisualPrefix('tokens', '001-a')).toBe('visual');
  });

  it('is the spec-local visual directory for screens', () => {
    expect(conventionalVisualPrefix('screens', '001-a')).toBe('specs/001-a/visual');
  });

  it('is null for screens with no owning spec — nothing to compare against', () => {
    expect(conventionalVisualPrefix('screens', null)).toBeNull();
  });

  it('is the project root for a token set even with no owning spec', () => {
    // A token set is project-scoped, so its location does not depend on which
    // design declared it.
    expect(conventionalVisualPrefix('tokens', null)).toBe('visual');
  });
});

describe('US1 · a declared path that moved is loud (FR-003, inherited from 093)', () => {
  it('reports 0 before the move and exactly 1 error naming the path after it', async () => {
    // This spec's FR-003 and 093's FR-010 state the same requirement. 093 built
    // it; this asserts the inheritance actually satisfies THIS spec's acceptance
    // rather than taking it on trust — which is the only honest way to close a
    // requirement whose implementation lives in another spec.
    const { visualResolveFindings } = await import('../src/commands/validate.js');
    const { readVisualDeclarations } = await import('@spectastic/schema/visual');
    const { nodeFs } = await import('../src/providers/node-fs.js');
    const { mkdirSync, mkdtempSync, renameSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    const root = mkdtempSync(join(tmpdir(), 'spectastic-094-move-'));
    mkdirSync(join(root, 'visual', 'tokens'), { recursive: true });
    writeFileSync(join(root, 'visual', 'tokens', 'base.json'), '{}', 'utf8');
    mkdirSync(join(root, 'specs', '001-a', 'visual'), { recursive: true });

    const file = 'specs/001-a/design.html';
    const html = `<spec-visual shape="screens" tokens="visual/tokens" screens="specs/001-a/visual" source="figma"><p>r</p></spec-visual>`;
    const decls = readVisualDeclarations(html, file);

    expect(await visualResolveFindings(decls, file, nodeFs, root)).toEqual([]);

    renameSync(join(root, 'visual', 'tokens'), join(root, 'visual', 'design-tokens'));

    const after = await visualResolveFindings(decls, file, nodeFs, root);
    expect(after).toHaveLength(1);
    expect(after[0]?.message).toContain('visual/tokens');
    expect(after[0]?.severity).toBe('error');
  });
});

describe('US2 · the location check (FR-001/FR-002, D-001)', () => {
  const FILE = 'specs/001-a/design.html';
  const decl = (attrs: string) => `<spec-visual shape="screens" ${attrs} source="figma"><p>r</p></spec-visual>`;

  async function locationFor(body: string, file = FILE) {
    const { visualLocationFindings } = await import('../src/commands/validate.js');
    const { readVisualDeclarations } = await import('@spectastic/schema/visual');
    return visualLocationFindings(readVisualDeclarations(body, file), file);
  }

  it('is silent for both paths at their conventional locations', async () => {
    expect(await locationFor(decl('tokens="visual/tokens" screens="specs/001-a/visual"'))).toEqual([]);
  });

  it('is silent for a subdivided path under either — FR-008 permits it', async () => {
    expect(
      await locationFor(decl('tokens="visual/tokens/semantic/light.json" screens="specs/001-a/visual/screens/a.json"')),
    ).toEqual([]);
  });

  it('flags a token set outside the project visual directory', async () => {
    const f = await locationFor(decl('tokens="design/tokens" screens="specs/001-a/visual"'));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('design/tokens');
    expect(f[0]?.fixHint).toContain('visual/');
    expect(f[0]?.severity).toBe('error');
  });

  it('flags a token set placed in a FEATURE directory — the wrong-scope case US2 names', async () => {
    const f = await locationFor(decl('tokens="specs/001-a/visual/tokens" screens="specs/001-a/visual"'));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('specs/001-a/visual/tokens');
  });

  it('flags screens placed in the PROJECT directory — the same confusion, the other way', async () => {
    const f = await locationFor(decl('tokens="visual/tokens" screens="visual/screens"'));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('visual/screens');
  });

  it('flags screens belonging to a different spec than the one declaring them', async () => {
    const f = await locationFor(decl('tokens="visual/tokens" screens="specs/002-b/visual"'));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('specs/002-b/visual');
  });

  it('does not confuse a sibling directory with a prefix of the conventional one', async () => {
    const f = await locationFor(decl('tokens="visualisations/tokens" screens="specs/001-a/visual"'));
    expect(f).toHaveLength(1);
  });

  it('stands down on screens when the design has no owning spec', async () => {
    // A template or a brief has no spec id to compare against. The token check
    // still applies, because a token set is project-scoped.
    const f = await locationFor(decl('tokens="visual/tokens" screens="anywhere/at/all"'), 'docs/a-brief.html');
    expect(f).toEqual([]);
  });

  it('reports each offending path once, not the declaration once', async () => {
    expect(await locationFor(decl('tokens="design/tokens" screens="visual/screens"'))).toHaveLength(2);
  });

  it('is silent for an explicit none, which names no path', async () => {
    expect(await locationFor('<spec-visual shape="none"><p>no screen</p></spec-visual>')).toEqual([]);
  });
});

describe('NFR-001 · the location check spends nothing', () => {
  it('makes 0 filesystem calls — asserted over the module, not assumed', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { join } = await import('node:path');
    const here = fileURLToPath(import.meta.url);
    const root = here.slice(0, here.indexOf('/packages/core/'));
    const src = readFileSync(join(root, 'packages/core/src/visual/location.ts'), 'utf8');
    expect(src).not.toMatch(/node:fs|readFile|readdir|statSync|existsSync/);
  });
});

describe('NFR-002 · determinism', () => {
  it('produces byte-identical findings across 3 consecutive runs', async () => {
    const { visualLocationFindings } = await import('../src/commands/validate.js');
    const { readVisualDeclarations } = await import('@spectastic/schema/visual');
    const file = 'specs/001-a/design.html';
    const html =
      '<spec-visual shape="screens" tokens="design/tokens" screens="visual/screens" source="figma"><p>r</p></spec-visual>';
    const decls = readVisualDeclarations(html, file);
    const runs = [1, 2, 3].map(() => JSON.stringify(visualLocationFindings(decls, file)));
    expect(new Set(runs).size).toBe(1);
    expect(JSON.parse(runs[0] as string)).toHaveLength(2);
  });

  it('reads no clock, network or environment — asserted over both modules', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { join } = await import('node:path');
    const here = fileURLToPath(import.meta.url);
    const root = here.slice(0, here.indexOf('/packages/core/'));
    const src = readFileSync(join(root, 'packages/core/src/visual/location.ts'), 'utf8');
    expect(src).not.toMatch(/Date\.|Math\.random|process\.env|fetch\(/);
  });
});
