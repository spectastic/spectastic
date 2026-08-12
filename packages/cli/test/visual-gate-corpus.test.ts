import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { visualSectionGatedFindings } from '@spectastic/core/commands/validate';
import { projectHasVisualSurface } from '@spectastic/core/visual/read';
import { describe, expect, it } from 'vitest';
import { expandGlobs } from '../src/glob.js';

/**
 * Absence over emptiness, proved on this repository (spec
 * 093-design-visual-section, SC-002).
 *
 * SC-002 asks for two counts to be 0 "produced by a check rather than
 * asserted", and this is that check. spectastic is a CLI and three libraries:
 * it has no user interface, so every one of its designs must carry no Visual
 * surface section at all — not an empty one, not one reporting a gap.
 *
 * The rule this spec writes therefore excludes the design that wrote it, which
 * is the requirement working rather than an oversight. If someone later adds a
 * UI dependency to this repository, `projectHasVisualSurface` flips and this
 * test's premise is gone — so the premise is asserted rather than assumed.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..');
const DESIGNS = ['specs/**/design.html'];

describe('SC-002 · a project with no interface carries no visual section', () => {
  it('this repository genuinely has no user interface, detected or declared', () => {
    // The premise. Without it the counts below would be 0 for the wrong reason.
    expect(projectHasVisualSurface(REPO_ROOT)).toBe(false);
  });

  it('0 designs carry a populated Visual surface section, and 0 gaps are reported', async () => {
    const files = await expandGlobs(DESIGNS.map((p) => join(REPO_ROOT, p)));
    expect(files.length).toBeGreaterThan(60); // the glob resolved the real estate

    const offenders: string[] = [];
    for (const file of files) {
      const html = readFileSync(file, 'utf8');
      const findings = visualSectionGatedFindings(html, file, false);
      if (findings.length > 0) offenders.push(`${file} — ${findings[0]?.message}`);
    }

    expect(offenders).toEqual([]);
  });

  it('reports nothing at all for the absent case — silence, not a gap row', async () => {
    const files = await expandGlobs(DESIGNS.map((p) => join(REPO_ROOT, p)));
    // The distinction SC-002 turns on: an absent section produces no finding of
    // any severity, rather than an informational "no visual surface declared".
    const total = files.reduce(
      (n, file) => n + visualSectionGatedFindings(readFileSync(file, 'utf8'), file, false).length,
      0,
    );
    expect(total).toBe(0);
  });
});
