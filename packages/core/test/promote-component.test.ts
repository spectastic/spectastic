import { describe, expect, it } from 'vitest';
import { executeComponentPromotion, planComponentPromotion } from '../src/visual/promote-component.js';
import type { FileSystem } from '../src/types.js';

/**
 * Component promotion (spec 097, FR-002/FR-003/FR-004, design D-003).
 *
 * Cloned from the contract promotion because the three properties are the same
 * three: planned before any write, aborts entirely on any conflict, refuses
 * when the destination has moved since the proposal recorded it. The
 * comparison that matters is baseline-versus-current, never
 * incoming-versus-current — the incoming component is EXPECTED to differ, since
 * that is the point of promoting.
 *
 * Two tests here are about absences rather than behaviour: nothing detects
 * reuse, and a consumed component's promotion moves no file. Both are the
 * cases an implementation is most likely to get wrong in the direction that
 * looks correct.
 */

function stubFs(files: Record<string, string>): FileSystem & { written: Record<string, string> } {
  const written: Record<string, string> = {};
  return {
    written,
    async readFile(path: string) {
      const f = files[path];
      if (f === undefined) throw new Error(`ENOENT ${path}`);
      return f;
    },
    async writeFile(path: string, content: string) {
      written[path] = content;
      files[path] = content;
    },
    async readdir() {
      return Object.keys(files);
    },
    async stat(path: string) {
      return { isFile: files[path] !== undefined, isDirectory: false };
    },
    async rename(from: string, to: string) {
      files[to] = files[from] ?? '';
      delete files[from];
      written[to] = files[to];
    },
    async rm(path: string) {
      delete files[path];
    },
    async mkdir() {
      /* no-op */
    },
  };
}

const PROPOSAL = {
  component: 'rate-badge',
  from: 'specs/001-convert/visual/rate-badge.component.html',
  to: 'visual/components/rate-badge.component.html',
  baseline: undefined as string | undefined,
  referringFiles: ['specs/001-convert/design.html'],
};

describe('a plan reads and writes nothing (FR-003)', () => {
  it('produces writes without touching the filesystem', async () => {
    const fs = stubFs({ [PROPOSAL.from]: '<spec-component name="rate-badge" scope="feature"/>' });
    const plan = await planComponentPromotion(PROPOSAL, fs, '/repo');
    expect(plan.conflicts).toEqual([]);
    expect(plan.writes.length).toBeGreaterThan(0);
    expect(fs.written).toEqual({});
  });
});

describe('a conflict aborts the whole plan (FR-003)', () => {
  it('clears the writes rather than applying the ones before it', async () => {
    // The destination already holds something the proposal did not record.
    const fs = stubFs({
      [PROPOSAL.from]: '<spec-component name="rate-badge" scope="feature"/>',
      [PROPOSAL.to]: '<spec-component name="rate-badge" scope="project"/>',
    });
    const plan = await planComponentPromotion({ ...PROPOSAL, baseline: undefined }, fs, '/repo');
    expect(plan.conflicts.length).toBeGreaterThan(0);
    expect(plan.writes).toEqual([]);
  });

  it('executing a conflicted plan writes nothing at all', async () => {
    const fs = stubFs({
      [PROPOSAL.from]: '<spec-component name="rate-badge" scope="feature"/>',
      [PROPOSAL.to]: '<spec-component name="rate-badge" scope="project"/>',
    });
    const plan = await planComponentPromotion(PROPOSAL, fs, '/repo');
    await executeComponentPromotion(plan, fs, '/repo');
    expect(fs.written).toEqual({});
  });
});

describe('the moved-destination refusal compares baseline to current (FR-003)', () => {
  it('permits promotion when the destination matches the recorded baseline', async () => {
    const existing = '<spec-component name="rate-badge" scope="project" maturity="draft"/>';
    const fs = stubFs({
      [PROPOSAL.from]: '<spec-component name="rate-badge" scope="project" maturity="accepted"/>',
      [PROPOSAL.to]: existing,
    });
    // Incoming DIFFERS from current — that is the point of promoting. What
    // must not have changed is current versus the recorded baseline.
    const plan = await planComponentPromotion({ ...PROPOSAL, baseline: existing }, fs, '/repo');
    expect(plan.conflicts).toEqual([]);
  });

  it('refuses when the destination has moved since the baseline was recorded', async () => {
    const fs = stubFs({
      [PROPOSAL.from]: '<spec-component name="rate-badge" scope="project"/>',
      [PROPOSAL.to]: '<spec-component name="rate-badge" scope="project" maturity="review"/>',
    });
    const plan = await planComponentPromotion(
      { ...PROPOSAL, baseline: '<spec-component name="rate-badge" scope="project"/>' },
      fs,
      '/repo',
    );
    expect(plan.conflicts.length).toBe(1);
    expect(plan.conflicts[0]?.reason).toMatch(/changed|moved|diverged/i);
  });
});

describe('a consumed component relocates nothing (FR-010)', () => {
  it('plans declaration updates and no file move', async () => {
    // The case an implementation assuming a file move breaks on: every other
    // origin does involve a file, and this one has none in the project at all.
    const fs = stubFs({ 'specs/001-convert/design.html': '<spec-component name="grid" origin="consumed"/>' });
    const plan = await planComponentPromotion(
      {
        component: 'grid',
        from: undefined,
        to: undefined,
        baseline: undefined,
        referringFiles: ['specs/001-convert/design.html'],
      },
      fs,
      '/repo',
    );
    expect(plan.conflicts).toEqual([]);
    expect(plan.writes).toEqual([]);
    expect(plan.declarationUpdates.length).toBeGreaterThan(0);
  });
});

describe('promotion is never automatic (FR-002)', () => {
  it('the module detects no reuse and initiates nothing', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { join } = await import('node:path');
    const here = fileURLToPath(import.meta.url);
    const root = here.slice(0, here.indexOf('/packages/core/'));
    const src = readFileSync(join(root, 'packages/core/src/visual/promote-component.ts'), 'utf8');
    // No scanning for candidates, no similarity, no threshold. The entry point
    // takes an already-decided proposal, because promoting on detected reuse
    // converts a weak signal into a strong-looking one.
    expect(src).not.toMatch(/similar|detectReuse|candidates|threshold|autoPromote/i);
  });
});

describe('execution applies a clean plan (FR-004)', () => {
  it('moves the file and reports the declarations that must follow it', async () => {
    const fs = stubFs({ [PROPOSAL.from]: '<spec-component name="rate-badge" scope="feature"/>' });
    const plan = await planComponentPromotion(PROPOSAL, fs, '/repo');
    const result = await executeComponentPromotion(plan, fs, '/repo');
    expect(result.moved).toBe(1);
    expect(Object.keys(fs.written)).toContain(PROPOSAL.to);
    expect(result.declarationsToUpdate).toContain('specs/001-convert/design.html');
  });
});
