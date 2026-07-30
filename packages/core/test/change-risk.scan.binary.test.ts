import { describe, expect, it } from 'vitest';
import { scan } from '../src/change-risk/scan.js';

/** Unit test for the binary-blob detector (spec 049 FR-002/FR-003, plan D-005). */

describe('scan — binary-blob detector', () => {
  it('flags a newly-added binary file as HIGH', () => {
    const patch = [
      'diff --git a/logo.png b/logo.png',
      'new file mode 100644',
      'index 0000000..1641876',
      'Binary files /dev/null and b/logo.png differ',
    ].join('\n');
    const findings = scan({ patch, numstat: '-\t-\tlogo.png\n' });
    expect(findings).toEqual([
      {
        category: 'binary-blob',
        weight: 'high',
        file: 'logo.png',
        evidence: expect.any(String),
      },
    ]);
  });

  it('emits no finding when there is no binary marker', () => {
    const patch = [
      'diff --git a/readme.txt b/readme.txt',
      'index ce01362..1234567 100644',
      '--- a/readme.txt',
      '+++ b/readme.txt',
      '@@ -1 +1 @@',
      '-hello',
      '+hello world',
    ].join('\n');
    expect(scan({ patch, numstat: '1\t1\treadme.txt\n' })).toEqual([]);
  });
});
