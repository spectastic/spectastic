import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildDocCache } from '../src/commands/validate.js';

/**
 * One read and one parse per file, per validate run.
 *
 * A validate run is the rule engine plus a dozen filesystem-facing scans, and
 * each used to read and parse the same files independently. Instrumented on
 * this repository that came to 1489 parse() calls for 379 files — 24.1MB of
 * parsing over a 6.1MB working set, most files parsed four times and every
 * contract-bearing design six.
 *
 * The parse function is injected precisely so this can be asserted without
 * global state. Without a test the count silently climbs back the first time
 * somebody adds a scan that reads a file itself, which is exactly how it got
 * to four in the first place.
 */

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'spectastic-doccache-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
  return root;
}

const DOC = '<!doctype html><html><body><spec-status value="draft">Draft</spec-status></body></html>';

describe('buildDocCache', () => {
  it('parses each file exactly once', async () => {
    const root = project({ 'a.html': DOC, 'b.html': DOC, 'c.html': DOC });
    const files = ['a.html', 'b.html', 'c.html'].map((f) => join(root, f));

    let parses = 0;
    const cache = await buildDocCache(files, {
      parse: (html, file) => {
        parses++;
        return { html, file, ast: {} as never };
      },
    });

    expect(parses).toBe(3);
    expect(cache.size).toBe(3);
  });

  it('reads each file exactly once', async () => {
    const root = project({ 'a.html': DOC, 'b.html': DOC });
    const files = ['a.html', 'b.html'].map((f) => join(root, f));

    const reads: string[] = [];
    await buildDocCache(files, {
      readFile: async (f) => {
        reads.push(f);
        return DOC;
      },
      parse: (html, file) => ({ html, file, ast: {} as never }),
    });

    expect(reads).toEqual(files);
  });

  it('returns the SAME document instance for a file, so scans share one parse', async () => {
    const root = project({ 'a.html': DOC });
    const file = join(root, 'a.html');
    const cache = await buildDocCache([file]);
    // Two consumers reading the cache must get one object, not two equal ones —
    // identity is what proves the parse was not repeated.
    expect(cache.get(file)?.parsed).toBe(cache.get(file)?.parsed);
    expect(cache.get(file)?.html).toContain('spec-status');
  });

  it('omits a file it cannot read rather than throwing', async () => {
    const root = project({ 'a.html': DOC });
    const cache = await buildDocCache([join(root, 'a.html'), join(root, 'missing.html')]);
    expect(cache.size).toBe(1);
    expect(cache.has(join(root, 'missing.html'))).toBe(false);
  });

  it('is empty for no files', async () => {
    expect((await buildDocCache([])).size).toBe(0);
  });
});
