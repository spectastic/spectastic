/**
 * T-1301 (spec 000, apply kernel amendment 2026-07-26-apply-add-delta-placement-and-paths) —
 * an embedded `<spec-requirement>`'s relative links are re-based from proposal depth to
 * live-spec depth when the kernel folds it into `spec.html` (triage T-020).
 *
 * Depths (repo-root-relative directory nesting):
 *   - a proposal lives at `specs/<id>/changes/<date>-<slug>/proposal.html` — 4 levels deep,
 *     so a `../`-relative link needs 4 `../` to reach the repo root.
 *   - the live spec lives at `specs/<id>/spec.html` — 2 levels deep, needing only 2 `../` to
 *     reach the same root.
 * The difference is always exactly 2, regardless of the link's ultimate target — so re-basing
 * is "strip the first two `../` segments from every `href`/`src` that has them":
 *   - `principles.html` (root file): proposal `../../../../principles.html` (4) → live
 *     `../../principles.html` (2).
 *   - a sibling spec (`specs/<other>/spec.html`, itself 2 deep, one level up-and-over from
 *     `specs/<id>/`): proposal `../../../<other>/spec.html` (3) → live `../<other>/spec.html` (1).
 *   - a sibling artifact in the *same* spec's own directory (`triage-log.html`, `plan.html`):
 *     proposal `../../triage-log.html` (2) → live `triage-log.html` (0 — a bare relative path,
 *     since it now sits beside `spec.html` in the same directory).
 *   - a same-document `#ID` anchor carries no `../` at all and is depth-independent — untouched,
 *     on both `added` and `modified`.
 *
 * Written red-first: today's `apply.ts` (`wrapRequirement`, `:104-119`) splices the embedded
 * post-state in verbatim on both the `added` and `modified` branches — no re-basing at all.
 */

import { describe, expect, it } from 'vitest';
import { applyCommand } from '@spectastic/core/commands/apply';
import type { FileSystem, KernelContext } from '@spectastic/core';

function stubFs(initial: Record<string, string>): { fs: FileSystem; files: Map<string, string> } {
  const files = new Map(Object.entries(initial));
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
      files.set(to, files.get(from) ?? '');
      files.delete(from);
    },
    async rm(path) {
      files.delete(path);
    },
    async mkdir() {
      /* no-op */
    },
  };
  return { fs, files };
}

const LIVE_SPEC = `<!doctype html><html><body>
<section id="context"><p>Context.</p></section>
<section id="requirements">
<spec-requirement id="FR-001" priority="must"><p>Original.</p></spec-requirement>
</section>
<section id="changelog"><spec-changelog><ol></ol></spec-changelog></section>
</body></html>`;

// Every link written exactly as a proposal author would author it, at proposal depth (4),
// per the corpus convention: a same-spec cross-ref as a bare #ID (proposal authors already
// write these depth-independent, matching the live-spec form they'll land as); a root file
// at 4 "../"; a sibling spec at 3 "../"; a same-spec-directory sibling at 2 "../".
function proposalBody(op: 'added' | 'modified'): string {
  return `<!doctype html><html><body>
<spec-change id="2026-01-01-rebase" status="approved">
<spec-delta op="${op}" target="FR-001">
  <spec-requirement id="FR-001" priority="must">
    <p>See <a href="#FR-999">FR-999</a> in this spec, <a href="../../../../principles.html#P-8">P-8</a>,
    <a href="../../../006-kernel-extraction/spec.html#FR-009">006 FR-009</a>, and
    <a href="../../triage-log.html#T-004">T-004</a>.</p>
  </spec-requirement>
</spec-delta>
</spec-change>
</body></html>`;
}

describe('apply kernel — embedded requirement link re-basing, proposal depth → live-spec depth (triage T-020)', () => {
  it('added: re-bases every relative link; a #ID anchor is untouched', async () => {
    const { fs, files } = stubFs({
      '/specs/019/spec.html': LIVE_SPEC,
      '/specs/019/changes/2026-01-01-rebase/proposal.html': proposalBody('added')
        // an ADD needs a target id not already present
        .replace(/target="FR-001"/, 'target="FR-002"')
        .replace(/id="FR-001"/g, 'id="FR-002"'),
    });
    const ctx: KernelContext = { cwd: '', fs };

    const result = await applyCommand(
      { kind: 'apply', specId: '019', slug: '2026-01-01-rebase' },
      ctx,
    );

    expect(result.deltas[0]?.result).toBe('success');
    const updated = files.get('/specs/019/spec.html')!;
    const requirementBlock = updated.slice(
      updated.indexOf('<spec-requirement id="FR-002"'),
      updated.indexOf('</spec-requirement>', updated.indexOf('<spec-requirement id="FR-002"')),
    );

    expect(requirementBlock).toContain('href="#FR-999"'); // untouched, depth-independent
    expect(requirementBlock).toContain('href="../../principles.html#P-8"'); // 4 → 2
    expect(requirementBlock).toContain(
      'href="../006-kernel-extraction/spec.html#FR-009"',
    ); // 3 → 1
    expect(requirementBlock).toContain('href="triage-log.html#T-004"'); // 2 → 0

    // Never the unconverted proposal-depth forms.
    expect(requirementBlock).not.toContain('../../../../principles.html');
    expect(requirementBlock).not.toContain('../../../006-kernel-extraction');
    expect(requirementBlock).not.toContain('../../triage-log.html');
  });

  it('modified: re-bases every relative link the same way; a #ID anchor is untouched', async () => {
    const { fs, files } = stubFs({
      '/specs/019/spec.html': LIVE_SPEC,
      '/specs/019/changes/2026-01-01-rebase/proposal.html': proposalBody('modified'),
    });
    const ctx: KernelContext = { cwd: '', fs };

    const result = await applyCommand(
      { kind: 'apply', specId: '019', slug: '2026-01-01-rebase' },
      ctx,
    );

    expect(result.deltas[0]?.result).toBe('success');
    const updated = files.get('/specs/019/spec.html')!;
    const requirementBlock = updated.slice(
      updated.indexOf('<spec-requirement id="FR-001"'),
      updated.indexOf('</spec-requirement>', updated.indexOf('<spec-requirement id="FR-001"')),
    );

    expect(requirementBlock).toContain('href="#FR-999"');
    expect(requirementBlock).toContain('href="../../principles.html#P-8"');
    expect(requirementBlock).toContain('href="../006-kernel-extraction/spec.html#FR-009"');
    expect(requirementBlock).toContain('href="triage-log.html#T-004"');

    expect(requirementBlock).not.toContain('../../../../principles.html');
    expect(requirementBlock).not.toContain('../../../006-kernel-extraction');
    expect(requirementBlock).not.toContain('../../triage-log.html');
  });
});
