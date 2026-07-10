import { describe, expect, it } from 'vitest';
import { BLOCK_END, BLOCK_START, mergeBlock } from '../src/commands/gitignore/apply.js';
import { stackEntries } from '../src/commands/gitignore/entries.js';

/** Unit tests for the sentinel-block merge (spec 043 T-101 / T-300). */

const BASE = ['.spectastic/courses/'];

describe('mergeBlock', () => {
  it('writes a fresh block into an empty file', () => {
    const out = mergeBlock('', BASE);
    expect(out).toContain(BLOCK_START);
    expect(out).toContain('.spectastic/courses/');
    expect(out).toContain(BLOCK_END);
  });

  it('preserves user lines outside the block (never clobbers)', () => {
    const existing = '# mine\n*.secret\nbuild-out/\n';
    const out = mergeBlock(existing, BASE);
    expect(out).toContain('*.secret');
    expect(out).toContain('build-out/');
    // user content comes before the appended block
    expect(out.indexOf('build-out/')).toBeLessThan(out.indexOf(BLOCK_START));
  });

  it('is idempotent — same entries twice yields identical output', () => {
    const once = mergeBlock('', BASE);
    const twice = mergeBlock(once, BASE);
    expect(twice).toBe(once);
  });

  it('unions new entries into an existing block (additive across callers)', () => {
    const base = mergeBlock('', BASE);
    const grown = mergeBlock(base, [...BASE, 'node_modules/', 'dist/']);
    expect(grown).toContain('node_modules/');
    expect(grown).toContain('dist/');
    // still one block, not two
    expect(grown.match(new RegExp(BLOCK_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length).toBe(1);
  });

  it('does not duplicate an entry already present', () => {
    const base = mergeBlock('', BASE);
    const again = mergeBlock(base, BASE);
    expect(again.match(/\.spectastic\/courses\//g)?.length).toBe(1);
  });

  it('appends the block after existing content with a single blank line', () => {
    const out = mergeBlock('a/\n', BASE);
    expect(out).toContain('a/\n\n' + BLOCK_START);
  });
});

describe('stackEntries', () => {
  it('unions ignores for detected ecosystems, deduped', () => {
    const e = stackEntries(['js', 'python']);
    expect(e).toContain('node_modules/');
    expect(e).toContain('__pycache__/');
    expect(new Set(e).size).toBe(e.length);
  });

  it('is empty for an unknown ecosystem', () => {
    expect(stackEntries(['cobol'])).toEqual([]);
  });
});
