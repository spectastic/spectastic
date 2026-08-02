import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shouldAskDependencies } from '../src/units/read.js';
import { writeDeclaredEdge } from '../src/units/write.js';

/**
 * The edge writer (spec 080-unit-edge-authoring, US1).
 *
 * Every refusal is decided before a byte is written (D-002), so the
 * byte-identical assertions below are testing an arrangement rather than a
 * cleanup path — there is no code route on which a partial write exists.
 */

const SELF = 'spectastic://spectastic/spectastic/unit/@spectastic/core';
const TARGET = 'spectastic://acme/payments/unit/@acme/ledger';

function project(body?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-units-write-'));
  if (body !== undefined) writeFileSync(join(dir, 'spectastic.json'), body, 'utf8');
  return dir;
}

const read = (dir: string): string => readFileSync(join(dir, 'spectastic.json'), 'utf8');

/** Every file under `dir` with its size — enough to catch a create or a rewrite. */
function snapshot(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (!entry.isDirectory()) out.push(`${entry.name}:${statSync(abs).size}`);
  }
  return out.sort();
}

describe('US1 · the write lands and is idempotent (080 T-100, SC-001)', () => {
  it('records the edge', () => {
    const dir = project('{\n  "project": "spectastic/spectastic"\n}\n');
    expect(writeDeclaredEdge(dir, SELF, TARGET)).toEqual({ ok: true, written: true });
    expect(JSON.parse(read(dir)).consumes).toEqual([TARGET]);
  });

  it('re-running changes at most 0 bytes', () => {
    const dir = project('{\n  "project": "spectastic/spectastic"\n}\n');
    writeDeclaredEdge(dir, SELF, TARGET);
    const after = read(dir);
    expect(writeDeclaredEdge(dir, SELF, TARGET)).toEqual({ ok: true, written: false });
    expect(read(dir)).toBe(after);
  });
});

describe('US1 · unrelated content survives (080 T-101, SC-002/FR-002)', () => {
  it('leaves every other key and its formatting untouched', () => {
    const dir = project(
      '{\n\t"project": "a/b",\n\t"git": {\n\t\t"auto": "commit"\n\t},\n\t"validate": {\n\t\t"quantifiedNfrFloor": 69\n\t}\n}\n',
    );
    writeDeclaredEdge(dir, SELF, TARGET);
    const after = read(dir);
    // Tab indentation preserved, and the untouched nested values byte-identical.
    expect(after).toContain('\t\t"auto": "commit"');
    expect(after).toContain('\t\t"quantifiedNfrFloor": 69');
    expect(JSON.parse(after).git).toEqual({ auto: 'commit' });
  });
});

describe('US1 · every refusal leaves the file byte-identical (080 T-102, NFR-002)', () => {
  it('refuses an edge naming the declaring unit itself', () => {
    const dir = project('{\n  "project": "spectastic/spectastic"\n}\n');
    const before = read(dir);
    const result = writeDeclaredEdge(dir, SELF, SELF);
    expect(result.ok).toBe(false);
    expect(read(dir)).toBe(before);
  });

  it('refuses a malformed target', () => {
    const dir = project('{\n  "project": "spectastic/spectastic"\n}\n');
    const before = read(dir);
    expect(writeDeclaredEdge(dir, SELF, 'not a coordinate').ok).toBe(false);
    expect(read(dir)).toBe(before);
  });

  it('refuses rather than clobbering an unparseable config', () => {
    const dir = project('{ this is not json');
    const before = read(dir);
    expect(writeDeclaredEdge(dir, SELF, TARGET).ok).toBe(false);
    expect(read(dir)).toBe(before);
  });

  it('states why it refused, naming the coordinate rather than a requirement id', () => {
    const dir = project('{\n  "project": "a/b"\n}\n');
    const result = writeDeclaredEdge(dir, SELF, SELF);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain(SELF);
    expect(result.ok === false && result.reason).not.toMatch(/FR-\d|NFR-\d|T-\d/);
  });
});

describe('US1 · a missing config is created (080 T-103, FR-004)', () => {
  it('creates a minimal config rather than refusing', () => {
    const dir = project(); // no spectastic.json at all
    expect(writeDeclaredEdge(dir, SELF, TARGET)).toEqual({ ok: true, written: true });
    expect(JSON.parse(read(dir)).consumes).toEqual([TARGET]);
  });
});

describe('polish · the write touches at most one file (080 T-900, NFR-001)', () => {
  it('creates or modifies nothing else', () => {
    const dir = project('{\n  "project": "a/b"\n}\n');
    writeFileSync(join(dir, 'README.md'), '# untouched\n', 'utf8');
    const before = snapshot(dir);
    writeDeclaredEdge(dir, SELF, TARGET);
    const after = snapshot(dir);
    expect(after.filter((f) => !f.startsWith('spectastic.json'))).toEqual(
      before.filter((f) => !f.startsWith('spectastic.json')),
    );
    expect(after).toHaveLength(before.length); // no new files
  });
});

describe('US2 · the prompt trigger, which is the checkable half (080 T-200, SC-004)', () => {
  it('does not fire for a single-unit project with no contract', () => {
    // SC-004's assertion: a solo project with no interface is asked at most 0
    // times. Asking it anyway is how a prompt trains authors to dismiss it.
    expect(shouldAskDependencies(1, false)).toBe(false);
    expect(shouldAskDependencies(0, false)).toBe(false);
  });

  it('fires for a multi-unit project', () => {
    expect(shouldAskDependencies(2, false)).toBe(true);
  });

  it('fires for a single-unit project that declares a contract', () => {
    expect(shouldAskDependencies(1, true)).toBe(true);
  });

  it('fails closed on an undeterminable shape', () => {
    expect(shouldAskDependencies(Number.NaN, false)).toBe(false);
    expect(shouldAskDependencies(-1, false)).toBe(false);
  });
});
