import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nodeFs } from '../src/providers/node-fs.js';
import { visualScreenNamingFindings } from '../src/visual/screen-naming.js';

/**
 * `visualScreenNamingFindings` (093 FR-014/FR-015, applied change
 * 2026-08-14-a-screen-has-a-name).
 *
 * The property under test is COMPLETENESS in both directions, which is what
 * separates this from the "at least one screen" wording that three proposal
 * rounds carried and the requirement finally rejected. Naming one screen out of
 * three must still fail, or the exemplar discrepancy that started every round
 * goes unreported by the check written to catch it.
 */

const FILE = 'specs/001-a/design.html';

const MATERIAL = `<!doctype html><html><body><main>
<spec-screen id="convert" name="convert"><spec-state id="idle" source="authored"></spec-state></spec-screen>
<spec-screen id="pairs" name="pairs"><spec-state id="idle" source="authored"></spec-state></spec-screen>
<spec-screen id="convert-unmapped" name="convert-unmapped"><spec-state id="idle" source="authored"></spec-state></spec-screen>
</main></body></html>`;

/** A project whose declared path is a DIRECTORY, which is what the exemplar
 *  declares and therefore the case most worth defaulting to. */
function project(body = MATERIAL, name = 'converter.screen.html'): string {
  const root = mkdtempSync(join(tmpdir(), 'spectastic-screen-naming-'));
  const abs = join(root, 'visual', name);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body, 'utf8');
  return root;
}

const claim = (addresses: string | undefined, screens = 'visual') => [
  { screens, addresses, line: 1, column: 1 },
];

describe('visual-screen-naming (093 FR-014/FR-015)', () => {
  it('is silent when every screen in the material is named', async () => {
    const root = project();
    const found = await visualScreenNamingFindings(claim('convert pairs convert-unmapped'), FILE, nodeFs, root);
    expect(found).toEqual([]);
  });

  it('reports each screen the design does not name, by name', async () => {
    const root = project();
    const found = await visualScreenNamingFindings(claim(undefined), FILE, nodeFs, root);
    expect(found).toHaveLength(3);
    expect(found.map((f) => f.message).join(' ')).toContain('"convert"');
    expect(found.map((f) => f.message).join(' ')).toContain('"pairs"');
    expect(found.map((f) => f.message).join(' ')).toContain('"convert-unmapped"');
    expect(found.every((f) => f.severity === 'error')).toBe(true);
    expect(found.every((f) => f.rule === 'visual-screen-naming')).toBe(true);
  });

  // The regression guard for the wording the requirement rejected. Under "at
  // least one screen" this case passes; under FR-014's completeness it must not.
  it('still reports when SOME screens are named — completeness, not non-emptiness', async () => {
    const root = project();
    const found = await visualScreenNamingFindings(claim('convert'), FILE, nodeFs, root);
    expect(found).toHaveLength(2);
    expect(found.map((f) => f.message).join(' ')).not.toContain('"convert" is in');
  });

  it('reports a named screen that resolves to nothing', async () => {
    const root = project();
    const found = await visualScreenNamingFindings(claim('convert pairs convert-unmapped settings'), FILE, nodeFs, root);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('names screen "settings"');
  });

  it('reports both directions at once', async () => {
    const root = project();
    const found = await visualScreenNamingFindings(claim('convert settings'), FILE, nodeFs, root);
    // pairs + convert-unmapped unnamed; settings unresolved.
    expect(found).toHaveLength(3);
  });

  // T-1304: the antecedent is shape="screens". A shape="none" declaration is a
  // legal FR-007 record and never reaches this function — the caller filters —
  // so the guarantee is that a design carrying no claim produces no findings.
  it('produces no findings when there is no claim to test', async () => {
    const root = project();
    expect(await visualScreenNamingFindings([], FILE, nodeFs, root)).toEqual([]);
  });

  it('stays silent on an unreadable path, which visual-resolve already owns', async () => {
    const root = project();
    const found = await visualScreenNamingFindings(claim('convert', 'visual/gone'), FILE, nodeFs, root);
    expect(found).toEqual([]);
  });

  it('reads a declared FILE as well as a directory', async () => {
    const root = project();
    const found = await visualScreenNamingFindings(
      claim('convert pairs convert-unmapped', 'visual/converter.screen.html'),
      FILE,
      nodeFs,
      root,
    );
    expect(found).toEqual([]);
  });

  it('merges screens across several files in a declared directory', async () => {
    const root = project();
    writeFileSync(
      join(root, 'visual', 'settings.screen.html'),
      `<!doctype html><html><body><main><spec-screen id="settings" name="settings"></spec-screen></main></body></html>`,
      'utf8',
    );
    const named = await visualScreenNamingFindings(
      claim('convert pairs convert-unmapped settings'),
      FILE,
      nodeFs,
      root,
    );
    expect(named).toEqual([]);
    const missing = await visualScreenNamingFindings(claim('convert pairs convert-unmapped'), FILE, nodeFs, root);
    expect(missing).toHaveLength(1);
    expect(missing[0]?.message).toContain('"settings"');
  });

  it('is silent when the material holds no screens at all', async () => {
    const root = project(`<!doctype html><html><body><main></main></body></html>`);
    expect(await visualScreenNamingFindings(claim(undefined), FILE, nodeFs, root)).toEqual([]);
  });

  // 095 FR-013 — the collision a per-file rule structurally cannot see.
  describe('two screens in one spec addressed as one name', () => {
    it('reports the collision, naming both files and both ids', async () => {
      const root = project();
      writeFileSync(
        join(root, 'visual', 'other.screen.html'),
        `<!doctype html><html><body><main><spec-screen id="convert-v2" name="convert"></spec-screen></main></body></html>`,
        'utf8',
      );
      const found = await visualScreenNamingFindings(
        claim('convert pairs convert-unmapped convert-v2'),
        FILE,
        nodeFs,
        root,
      );
      const collision = found.filter((f) => f.message.includes('both addressed as'));
      expect(collision).toHaveLength(1);
      expect(collision[0]?.message).toContain('converter.screen.html');
      expect(collision[0]?.message).toContain('other.screen.html');
      expect(collision[0]?.message).toContain('id="convert"');
      expect(collision[0]?.message).toContain('id="convert-v2"');
    });

    it('does not fire for the same name in a DIFFERENT spec — the coordinate is spec-qualified', async () => {
      // Two projects, each with a `convert`. The coordinate's first segment is
      // the owning spec, so these do not collide and must stay silent.
      const a = project();
      const b = project();
      expect(await visualScreenNamingFindings(claim('convert pairs convert-unmapped'), FILE, nodeFs, a)).toEqual([]);
      expect(await visualScreenNamingFindings(claim('convert pairs convert-unmapped'), FILE, nodeFs, b)).toEqual([]);
    });

    it('leaves a missing name to screen-shape rather than reporting it twice', async () => {
      const root = project(
        `<!doctype html><html><body><main><spec-screen id="a"></spec-screen><spec-screen id="b"></spec-screen></main></body></html>`,
      );
      const found = await visualScreenNamingFindings(claim('a b'), FILE, nodeFs, root);
      expect(found.filter((f) => f.message.includes('both addressed as'))).toEqual([]);
    });
  });
});
