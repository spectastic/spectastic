import { describe, expect, it } from 'vitest';
import { scan } from '../src/change-risk/scan.js';

/**
 * Unit test for the entropy/base64-payload detector (spec 049 FR-002/FR-003).
 * Includes the plan §8 false-positive fixtures — a real detector must not
 * fire on minified JS, a small base64 image data URI, or a lockfile hash.
 */

function addedLinePatch(file: string, line: string): string {
  return [
    `diff --git a/${file} b/${file}`,
    'index 1111111..2222222 100644',
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -0,0 +1 @@',
    `+${line}`,
  ].join('\n');
}

describe('scan — entropy/base64-payload detector', () => {
  it('flags a long high-entropy base64 payload as HIGH', () => {
    const payload = 'A'.repeat(500); // well past the false-positive fixtures below
    const patch = addedLinePatch('src/blob.ts', `const p = "${payload}";`);
    const findings = scan({ patch, numstat: '1\t0\tsrc/blob.ts\n' });
    expect(findings).toEqual([
      {
        category: 'entropy-payload',
        weight: 'high',
        file: 'src/blob.ts',
        evidence: expect.any(String),
      },
    ]);
  });

  it('does not flag a minified JS line (punctuation breaks any long base64-charset run)', () => {
    const minified = Array.from({ length: 60 }, (_, i) => `function f${i}(a,b){return a+b;}`).join('');
    const patch = addedLinePatch('dist/bundle.js', minified);
    expect(scan({ patch, numstat: '1\t0\tdist/bundle.js\n' })).toEqual([]);
  });

  it('does not flag a small base64 image data URI', () => {
    // A real 1x1 transparent PNG data URI — short, well under the threshold.
    const dataUri =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const patch = addedLinePatch('src/icon.ts', `export const icon = "${dataUri}";`);
    expect(scan({ patch, numstat: '1\t0\tsrc/icon.ts\n' })).toEqual([]);
  });

  it('does not flag a lockfile sha512 integrity hash', () => {
    const hash = 'sha512-XlY58v4XvT9awz2p4NmJT+ZgNVe6qYSKAP1z1U4wSyE0Yg4x+p93K6oRLnP/j5FPO0xCg5oV6XkIovhwaXWjhw==';
    const patch = addedLinePatch('package-lock.json', `      "integrity": "${hash}",`);
    expect(scan({ patch, numstat: '1\t0\tpackage-lock.json\n' })).toEqual([]);
  });
});
