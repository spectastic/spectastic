import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONFORMANCE_ELEMENTS } from '../src/conformance.js';

/**
 * `assets/spec.js` names the conformance-bearing elements a second time
 * (108-success-criteria, T-202, design D-005).
 *
 * The asset is plain browser JavaScript, belonging to no package, so it
 * cannot import `CONFORMANCE_ELEMENTS` — it carries its own copy. This is
 * the only thing standing between the two definitions silently diverging,
 * which design.html §11 names as the one duplication this spec accepts
 * rather than pretends away.
 */

const SPEC_JS = new URL('../../../assets/spec.js', import.meta.url);

describe('assets/spec.js names the same conformance-bearing elements as the predicate (D-005)', () => {
  it('the two lists agree', () => {
    const source = readFileSync(SPEC_JS, 'utf8');
    const match = /CONFORMANCE_ELEMENTS\s*=\s*\[([^\]]*)\]/.exec(source);
    expect(match, 'assets/spec.js has no CONFORMANCE_ELEMENTS array to compare against').not.toBeNull();
    const inlined = (match?.[1] ?? '')
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    expect([...inlined].sort()).toEqual([...CONFORMANCE_ELEMENTS].sort());
  });
});
