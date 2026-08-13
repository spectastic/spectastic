import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nodeFs } from '../src/providers/node-fs.js';

/**
 * Unit tests for `visualResolveFindings()` (spec 093-design-visual-section,
 * FR-010, design D-005). Written before the function exists.
 *
 * Containment is cloned verbatim from `contractResolveFindings` — the
 * security-relevant half stays byte-identical to a reviewed implementation.
 * Exactly one branch inverts: a path resolving to a DIRECTORY is an error for
 * a contract and silent for a visual path, because a token set split by mode
 * is the normal case (FR-005). That difference is named here so a later
 * "refactor" that re-unifies the two functions fails loudly.
 */

const FILE = 'specs/001-a/design.html';

function project(files: Record<string, string>, dirs: string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), 'spectastic-visual-resolve-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
  for (const d of dirs) mkdirSync(join(root, d), { recursive: true });
  return root;
}

async function resolveFor(root: string, body: string) {
  const { visualResolveFindings } = await import('../src/commands/validate.js');
  const { readVisualDeclarations } = await import('@spectastic/schema/visual');
  const html = `<!doctype html><html><body>${body}</body></html>`;
  return visualResolveFindings(readVisualDeclarations(html, FILE), FILE, nodeFs, root);
}

const decl = (attrs: string) => `<spec-visual shape="screens" ${attrs} source="figma"><p>r</p></spec-visual>`;

describe('a path that resolves', () => {
  it('is silent for a file', async () => {
    const root = project({ 'visual/tokens.json': '{}', 'specs/001-a/visual/s.json': '{}' });
    expect(await resolveFor(root, decl('tokens="visual/tokens.json" screens="specs/001-a/visual/s.json"'))).toEqual([]);
  });

  it('is silent for a DIRECTORY — where a contract path would error (D-005)', async () => {
    const root = project({ 'visual/tokens/light.json': '{}' }, ['specs/001-a/visual']);
    expect(await resolveFor(root, decl('tokens="visual/tokens" screens="specs/001-a/visual"'))).toEqual([]);
  });
});

describe('a path that does not resolve', () => {
  it('produces exactly 1 finding for an absent token path', async () => {
    const root = project({}, ['specs/001-a/visual']);
    const f = await resolveFor(root, decl('tokens="visual/gone" screens="specs/001-a/visual"'));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/visual\/gone/);
    expect(f[0]?.severity).toBe('error');
  });

  it('produces one finding per unresolved path rather than stopping at the first', async () => {
    const root = project({});
    expect(await resolveFor(root, decl('tokens="visual/gone" screens="specs/001-a/also-gone"'))).toHaveLength(2);
  });

  it('names which attribute the path came from, so the finding is actionable', async () => {
    const root = project({}, ['visual/tokens']);
    const f = await resolveFor(root, decl('tokens="visual/tokens" screens="specs/001-a/gone"'));
    expect(f[0]?.message).toMatch(/screens=/);
  });
});

describe('containment — rejected, never followed', () => {
  it('rejects an absolute path without stat-ing it', async () => {
    const root = project({}, ['specs/001-a/visual']);
    const f = await resolveFor(root, decl('tokens="/etc/passwd" screens="specs/001-a/visual"'));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/absolute/);
  });

  it('rejects a .. traversal that escapes the project', async () => {
    const root = project({}, ['specs/001-a/visual']);
    const f = await resolveFor(root, decl('tokens="../elsewhere/tokens" screens="specs/001-a/visual"'));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toMatch(/outside the project/);
  });

  it('permits a .. segment that stays inside the project', async () => {
    const root = project({ 'visual/tokens.json': '{}' }, ['specs/001-a/visual']);
    const f = await resolveFor(root, decl('tokens="specs/../visual/tokens.json" screens="specs/001-a/visual"'));
    expect(f).toEqual([]);
  });
});

describe('a declaration with nothing to resolve', () => {
  it('is silent for an explicit none', async () => {
    const root = project({});
    const html = '<spec-visual shape="none"><p>no screen</p></spec-visual>';
    expect(await resolveFor(root, html)).toEqual([]);
  });

  it('never resolves source=, which is provenance and not a path (FR-006)', async () => {
    const root = project({}, ['visual/tokens', 'specs/001-a/visual']);
    const html =
      '<spec-visual shape="screens" tokens="visual/tokens" screens="specs/001-a/visual" source="./a/design/file/that/is/gone.fig"><p>r</p></spec-visual>';
    expect(await resolveFor(root, html)).toEqual([]);
  });

  it('never resolves tokens-external, which names a package and not a path', async () => {
    const root = project({}, ['visual/tokens', 'specs/001-a/visual']);
    const html =
      '<spec-visual shape="screens" tokens="visual/tokens" tokens-external="@acme/tokens" screens="specs/001-a/visual" source="figma"><p>r</p></spec-visual>';
    expect(await resolveFor(root, html)).toEqual([]);
  });
});

/**
 * The variant grid path (093 FR-010, applied change
 * 2026-08-13-declare-the-variant-grid). It sits on the CONTRACT's side of the
 * directory divergence, not the token set's — which makes this file the place
 * where all three positions are asserted together, so a future re-unification
 * of these functions cannot quietly pick one.
 */
describe('the variant grid path', () => {
  it('is silent for a file, like any other declared path', async () => {
    const root = project({
      'visual/tokens.json': '{}',
      'visual/variants.html': '<main></main>',
      'specs/001-a/visual/s.json': '{}',
    });
    const findings = await resolveFor(
      root,
      decl('tokens="visual/tokens.json" variants="visual/variants.html" screens="specs/001-a/visual/s.json"'),
    );
    expect(findings).toEqual([]);
  });

  it('errors when it resolves to a directory, where a token set would not', async () => {
    const root = project({ 'specs/001-a/visual/s.json': '{}' }, ['visual/tokens', 'visual/variants']);
    const findings = await resolveFor(
      root,
      decl('tokens="visual/tokens" variants="visual/variants" screens="specs/001-a/visual/s.json"'),
    );
    // Exactly one finding: the grid. The token set directory stays silent in
    // the same run, which is the assertion that matters.
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('variants=');
    expect(findings[0]?.message).toContain('must be one file');
  });

  it('says why rather than reporting only a type mismatch', async () => {
    const root = project({ 'visual/tokens.json': '{}', 'specs/001-a/visual/s.json': '{}' }, ['visual/variants']);
    const [f] = await resolveFor(
      root,
      decl('tokens="visual/tokens.json" variants="visual/variants" screens="specs/001-a/visual/s.json"'),
    );
    expect(f?.fixHint).toMatch(/resolution order/);
  });

  it('errors when it does not resolve at all', async () => {
    const root = project({ 'visual/tokens.json': '{}', 'specs/001-a/visual/s.json': '{}' });
    const findings = await resolveFor(
      root,
      decl('tokens="visual/tokens.json" variants="visual/gone.html" screens="specs/001-a/visual/s.json"'),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('no such file or directory');
  });

  it('is rejected without being stat-ed when it escapes the project', async () => {
    const root = project({ 'visual/tokens.json': '{}', 'specs/001-a/visual/s.json': '{}' });
    const findings = await resolveFor(
      root,
      decl('tokens="visual/tokens.json" variants="../elsewhere/variants.html" screens="specs/001-a/visual/s.json"'),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('outside the project directory');
  });
});
