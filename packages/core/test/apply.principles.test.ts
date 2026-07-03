import { describe, expect, it } from 'vitest';
import { applyCommand } from '@spectastic/core/commands/apply';
import type { FileSystem, KernelContext } from '@spectastic/core';
import { validate } from '@spectastic/schema';
import { PRINCIPLES_LIVE, PRINCIPLES_PROPOSAL } from './fixtures/principles.js';

/**
 * Spec 030-kernel-principles-apply. The kernel applies a principles amendment via the
 * reserved `principles` spec-id: insert the principle bare, substitute version/tagline/TL;DR
 * from the <spec-principles-apply> block, skip the §6 fold, archive at root. US1 (happy path),
 * US2 (guards), Polish (real-validate smoke, SC-004).
 */

const SLUG = '2026-07-02-add-p3';

function stubFs(initial: Record<string, string>): {
  fs: FileSystem;
  files: Map<string, string>;
  ops: string[];
} {
  const files = new Map(Object.entries(initial));
  const ops: string[] = [];
  const fs: FileSystem = {
    async readFile(path) {
      const c = files.get(path);
      if (c === undefined) throw new Error(`ENOENT: ${path}`);
      return c;
    },
    async writeFile(path, content) {
      files.set(path, content);
    },
    async readdir() {
      return [];
    },
    async stat(path) {
      return { isFile: files.has(path), isDirectory: false };
    },
    async rename(from, to) {
      ops.push(`rename:${to}`);
      // Model a directory rename: move every key at or under `from/` to `to/`.
      for (const [k, v] of [...files]) {
        if (k === from || k.startsWith(`${from}/`)) {
          files.set(to + k.slice(from.length), v);
          files.delete(k);
        }
      }
    },
    async rm(path) {
      files.delete(path);
    },
    async mkdir(path) {
      ops.push(`mkdir:${path}`);
    },
  };
  return { fs, files, ops };
}

function freshRepo(proposal = PRINCIPLES_PROPOSAL): ReturnType<typeof stubFs> {
  return stubFs({
    '/principles.html': PRINCIPLES_LIVE,
    [`/changes/${SLUG}/proposal.html`]: proposal,
  });
}

const CTX = (fs: FileSystem): KernelContext => ({ cwd: '', fs });
const INPUT = { kind: 'apply' as const, specId: 'principles', slug: SLUG };

describe('applyCommand — principles (spec 030)', () => {
  describe('US1 · apply a principles amendment', () => {
    it('inserts the principle bare, after the last existing principle', async () => {
      const { fs, files } = freshRepo();
      await applyCommand(INPUT, CTX(fs));
      const out = files.get('/principles.html')!;
      // Bare <h3 id="P-3"> (not wrapped in <spec-requirement>), after P-2, inside core-principles.
      expect(out).toContain('<h3 id="P-3">P-3 · Third</h3>');
      expect(out).not.toContain('<spec-requirement id="P-3"');
      expect(out.indexOf('id="P-3"')).toBeGreaterThan(out.indexOf('id="P-2"'));
      expect(out.indexOf('id="P-3"')).toBeLessThan(out.indexOf('</section>'));
    });

    it('substitutes version in all three places, plus tagline and TL;DR', async () => {
      const { fs, files } = freshRepo();
      await applyCommand(INPUT, CTX(fs));
      const out = files.get('/principles.html')!;
      expect(out).toContain('Principles · v1.1.0'); // pill
      expect(out).toContain('<b>Version</b>     <span>1.1.0</span>'); // meta
      expect(out).toContain('Principles v1.1.0 ·'); // footer
      // The header sites flip; the changelog legitimately keeps its historical "v1.0.0".
      expect(out).not.toContain('Principles · v1.0.0'); // pill
      expect(out).not.toContain('<span>1.0.0</span>'); // meta
      expect(out).toContain('Three principles that bind the fixture.'); // tagline
      expect(out).toContain('<p>The fixture now rests on three principles.</p>'); // TL;DR
    });

    it('appends a changelog entry and does not create principles-tasks.html', async () => {
      const { fs, files } = freshRepo();
      const result = await applyCommand(INPUT, CTX(fs));
      expect(files.get('/principles.html')).toContain(`changes/archive/${SLUG}/proposal.html`);
      expect(files.has('/principles-tasks.html')).toBe(false);
      expect(result.foldedPhase).toBeNull(); // SC-003 — no §6 fold
    });

    it('flips the proposal to applied and archives it at root (mkdir before rename)', async () => {
      const { fs, files, ops } = freshRepo();
      const result = await applyCommand(INPUT, CTX(fs));
      expect(result.archivedPath).toBe(`/changes/archive/${SLUG}`);
      expect(files.get(`/changes/archive/${SLUG}/proposal.html`)).toContain('status="applied"');
      // mkdir the archive parent before the rename (T-007 discipline at root depth).
      expect(ops.indexOf('mkdir:/changes/archive')).toBeLessThan(ops.indexOf(`rename:/changes/archive/${SLUG}`));
      // Archived proposal's relative paths deepened (none in this fixture → no-op, but no crash).
      expect(files.has(`/changes/${SLUG}/proposal.html`)).toBe(false);
    });
  });

  describe('US2 · refuse an unsafe or stale apply', () => {
    it('refuses when a risk is still identified', async () => {
      const proposal = PRINCIPLES_PROPOSAL.replace(
        '<spec-principles-apply>',
        '<spec-risk target="P-3" status="identified"><p>x</p></spec-risk>\n<spec-principles-apply>',
      );
      const { fs, files } = freshRepo(proposal);
      await expect(applyCommand(INPUT, CTX(fs))).rejects.toThrow(/identified/i);
      expect(files.get('/principles.html')).toBe(PRINCIPLES_LIVE); // unchanged
    });

    it('refuses a stale proposal (declared from-version ≠ live version)', async () => {
      const stale = PRINCIPLES_PROPOSAL.replace('from="1.0.0"', 'from="0.9.0"');
      const { fs, files } = freshRepo(stale);
      await expect(applyCommand(INPUT, CTX(fs))).rejects.toThrow(/stale/i);
      expect(files.get('/principles.html')).toBe(PRINCIPLES_LIVE);
    });

    it('refuses when the <spec-principles-apply> block is missing', async () => {
      const noBlock = PRINCIPLES_PROPOSAL.replace(/<spec-principles-apply>[\s\S]*?<\/spec-principles-apply>/, '');
      const { fs, files } = freshRepo(noBlock);
      await expect(applyCommand(INPUT, CTX(fs))).rejects.toThrow(/spec-principles-apply/i);
      expect(files.get('/principles.html')).toBe(PRINCIPLES_LIVE);
    });
  });

  describe('Polish · SC-004 the produced principles.html validates clean', () => {
    it('validate reports zero error findings after apply', async () => {
      const { fs, files } = freshRepo();
      await applyCommand(INPUT, CTX(fs));
      const findings = validate(files.get('/principles.html')!, { file: 'principles.html' });
      const errors = findings.filter((f) => f.severity === 'error');
      expect(errors).toEqual([]);
    });
  });
});
