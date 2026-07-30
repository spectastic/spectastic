import { describe, expect, it } from 'vitest';
import { scan } from '../src/change-risk/scan.js';

/** Unit test for the build-script/CI/packaging-edit detector (spec 049 FR-002/FR-003). */

function patchFor(file: string): string {
  return [
    `diff --git a/${file} b/${file}`,
    'index 1111111..2222222 100644',
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -1 +1 @@',
    '-old',
    '+new',
  ].join('\n');
}

describe('scan — build-script/CI/packaging-edit detector', () => {
  it('flags a changed GitHub Actions workflow as MEDIUM', () => {
    const patch = patchFor('.github/workflows/ci.yml');
    expect(scan({ patch, numstat: '1\t1\t.github/workflows/ci.yml\n' })).toEqual([
      {
        category: 'build-script-edit',
        weight: 'medium',
        file: '.github/workflows/ci.yml',
        evidence: expect.any(String),
      },
    ]);
  });

  it('flags a changed Dockerfile as MEDIUM', () => {
    const patch = patchFor('Dockerfile');
    expect(scan({ patch, numstat: '1\t1\tDockerfile\n' })).toEqual([
      {
        category: 'build-script-edit',
        weight: 'medium',
        file: 'Dockerfile',
        evidence: expect.any(String),
      },
    ]);
  });

  it('does not flag an unrelated source file', () => {
    const patch = patchFor('src/index.ts');
    expect(scan({ patch, numstat: '1\t1\tsrc/index.ts\n' })).toEqual([]);
  });

  it('does not flag package.json under this detector (avoids double-counting a dependency bump)', () => {
    const patch = patchFor('package.json');
    expect(scan({ patch, numstat: '1\t1\tpackage.json\n' })).toEqual([]);
  });
});
