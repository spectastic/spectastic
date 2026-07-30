import { describe, expect, it } from 'vitest';
import { scan } from '../src/change-risk/scan.js';

/**
 * Unit test for the new-dependency detector (spec 049 FR-002/FR-003). Also
 * covers the spec edge case: a routine version-bump-only edit fires nothing.
 */

describe('scan — new-dependency detector', () => {
  it('flags a genuinely new dependency as LOW', () => {
    const patch = [
      'diff --git a/package.json b/package.json',
      'index 1111111..2222222 100644',
      '--- a/package.json',
      '+++ b/package.json',
      '@@ -1,3 +1,4 @@',
      ' {',
      '   "dependencies": {',
      '+    "left-pad": "^1.0.0",',
      '     "chalk": "^5.0.0"',
      '   }',
      ' }',
    ].join('\n');
    const findings = scan({ patch, numstat: '1\t0\tpackage.json\n' });
    expect(findings).toEqual([
      {
        category: 'new-dependency',
        weight: 'low',
        file: 'package.json',
        evidence: expect.any(String),
      },
    ]);
  });

  it('fires nothing on a routine version-bump-only edit (same key removed and re-added)', () => {
    const patch = [
      'diff --git a/package.json b/package.json',
      'index 1111111..2222222 100644',
      '--- a/package.json',
      '+++ b/package.json',
      '@@ -1,3 +1,3 @@',
      ' {',
      '   "dependencies": {',
      '-    "chalk": "^5.0.0"',
      '+    "chalk": "^5.1.0"',
      '   }',
      ' }',
    ].join('\n');
    expect(scan({ patch, numstat: '1\t1\tpackage.json\n' })).toEqual([]);
  });

  it('does not flag a change outside the dependency blocks', () => {
    const patch = [
      'diff --git a/package.json b/package.json',
      'index 1111111..2222222 100644',
      '--- a/package.json',
      '+++ b/package.json',
      '@@ -1,2 +1,2 @@',
      '-  "version": "1.0.0",',
      '+  "version": "1.0.1",',
    ].join('\n');
    expect(scan({ patch, numstat: '1\t1\tpackage.json\n' })).toEqual([]);
  });
});
