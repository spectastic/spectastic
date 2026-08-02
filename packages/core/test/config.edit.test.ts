import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addToSet, setIfAbsent } from '../src/config/edit.js';

/**
 * The shared `spectastic.json` editor (spec 080-unit-edge-authoring, D-001/D-003).
 *
 * Two policies over one implementation, because the callers genuinely differ:
 * `init` sets a key only if absent and must never overwrite an owner's value,
 * while the edge writer adds to a set so re-running is a no-op. Conflating them
 * would hand `init` an append it must never perform.
 */

function config(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-config-edit-'));
  writeFileSync(join(dir, 'spectastic.json'), body, 'utf8');
  return dir;
}

const read = (dir: string): string => readFileSync(join(dir, 'spectastic.json'), 'utf8');

describe('indentation is detected and preserved (080 T-010, D-001)', () => {
  it.each([
    ['2-space', '{\n  "project": "a/b"\n}\n', '  '],
    ['4-space', '{\n    "project": "a/b"\n}\n', '    '],
    ['tab', '{\n\t"project": "a/b"\n}\n', '\t'],
  ])('re-emits a %s config with its own indentation', (_label, body, indent) => {
    // The risk this closes is invisible in this repository, whose config is
    // already 2-space — exactly what the existing writers emit. A tab-indented
    // downstream project would have every line rewritten by a one-key change.
    const dir = config(body);
    setIfAbsent(dir, 'git', { auto: 'commit' });
    const after = read(dir);
    expect(after).toContain(`\n${indent}"project"`);
    expect(after).toContain(`\n${indent}"git"`);
  });

  it('leaves an untouched key byte-identical in its own line', () => {
    const dir = config('{\n\t"project": "a/b",\n\t"validate": {\n\t\t"quantifiedNfrFloor": 69\n\t}\n}\n');
    setIfAbsent(dir, 'consumes', ['x']);
    expect(read(dir)).toContain('\t\t"quantifiedNfrFloor": 69');
  });
});

describe('set-if-absent never overwrites (080 T-011, init semantics)', () => {
  it('writes when the key is absent', () => {
    const dir = config('{\n  "project": "a/b"\n}\n');
    expect(setIfAbsent(dir, 'corpus', { marketplace: 'a/b' })).toBe(true);
    expect(JSON.parse(read(dir)).corpus).toEqual({ marketplace: 'a/b' });
  });

  it('refuses when the key is present, whatever its value', () => {
    const dir = config('{\n  "corpus": {\n    "marketplace": "mine"\n  }\n}\n');
    const before = read(dir);
    expect(setIfAbsent(dir, 'corpus', { marketplace: 'theirs' })).toBe(false);
    expect(read(dir)).toBe(before); // byte-identical — an owner's value is never clobbered
  });

  it('creates the file when none exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spectastic-config-edit-'));
    expect(setIfAbsent(dir, 'project', 'a/b')).toBe(true);
    expect(JSON.parse(read(dir)).project).toBe('a/b');
  });
});

describe('add-to-set is idempotent (080 T-011, the edge-writer semantics)', () => {
  it('appends a new member', () => {
    const dir = config('{\n  "project": "a/b"\n}\n');
    expect(addToSet(dir, 'consumes', 'spectastic://x/y/unit/z')).toBe(true);
    expect(JSON.parse(read(dir)).consumes).toEqual(['spectastic://x/y/unit/z']);
  });

  it('re-adding the same member changes nothing, byte for byte', () => {
    const dir = config('{\n  "consumes": [\n    "spectastic://x/y/unit/z"\n  ]\n}\n');
    const before = read(dir);
    expect(addToSet(dir, 'consumes', 'spectastic://x/y/unit/z')).toBe(false);
    expect(read(dir)).toBe(before);
  });

  it('preserves existing members when adding another', () => {
    const dir = config('{\n  "consumes": [\n    "a"\n  ]\n}\n');
    addToSet(dir, 'consumes', 'b');
    expect(JSON.parse(read(dir)).consumes).toEqual(['a', 'b']);
  });

  it('treats a non-array value at the key as absent rather than corrupting it', () => {
    const dir = config('{\n  "consumes": "not an array"\n}\n');
    const before = read(dir);
    expect(addToSet(dir, 'consumes', 'a')).toBe(false);
    expect(read(dir)).toBe(before);
  });
});

describe('degradation (080 NFR-002)', () => {
  it('an unparseable config is refused, not overwritten', () => {
    const dir = config('{ this is not json');
    const before = read(dir);
    expect(setIfAbsent(dir, 'project', 'a/b')).toBe(false);
    expect(addToSet(dir, 'consumes', 'x')).toBe(false);
    expect(read(dir)).toBe(before); // the one case where clobbering would destroy work
  });

  it('never throws', () => {
    const dir = config('{ broken');
    expect(() => setIfAbsent(dir, 'k', 1)).not.toThrow();
    expect(() => addToSet(dir, 'k', 'v')).not.toThrow();
  });
});
