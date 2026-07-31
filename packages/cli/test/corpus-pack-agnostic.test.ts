import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { expandGlobs } from '../src/glob.js';

/**
 * 052-corpus-citation-contract T-300: the pack-agnosticism guard (FR-004,
 * SC-003). The "cite this in a <spec-decision grounding>" binding lives in
 * the harness (the plan verb + core), NEVER in a corpus pack — the moment a
 * pack embeds it, it stops being a clean, publishable domain skill (057).
 * This scans every committed corpus pack (the repo's dogfood corpus and the
 * init scaffold) for the citation-binding markup and asserts none appears.
 *
 * SCOPE (interview-anchored): SC-003 forbids the specific citation-BINDING —
 * the `<spec-decision grounding>` artifact markup FR-004 names — not any
 * mention of a spectastic verb. The `spectastic-concepts` dogfood corpus is a
 * corpus whose *domain is spectastic itself*, so it legitimately names
 * `/spectastic.design` and `<spec-rule>` as subject matter while teaching the
 * grounding discipline; that is content, not a binding. The broader
 * "zero spectastic knowledge" agnosticism that a *distributable* pack (a
 * finance-settlement skill) must satisfy is 057's concern, not this one.
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '..', '..', '..');

/** The citation-binding markup — spectastic artifact tags a pack must never
 * embed (per FR-004: "cite this in a <spec-decision grounding>"). A prose
 * mention of a verb name is NOT this. */
const BINDING_TOKENS = [/<spec-decision/, /grounding\s*=/];

describe('corpus packs carry zero spectastic binding (052 T-300, SC-003)', () => {
  it('no knowledge/ or templates/knowledge/ markdown embeds a citation-binding instruction', async () => {
    const files = await expandGlobs(['knowledge/**/*.md', 'templates/knowledge/**/*.md']);
    expect(files.length, 'expected at least the dogfood corpus + the init scaffold').toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      for (const token of BINDING_TOKENS) {
        if (token.test(content)) offenders.push(`${relative(REPO_ROOT, file)} :: ${token}`);
      }
    }
    expect(offenders, `a corpus pack leaked a citation binding:\n${offenders.join('\n')}`).toEqual([]);
  });
});
