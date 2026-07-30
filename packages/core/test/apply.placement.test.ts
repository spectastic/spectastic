/**
 * T-1300 (spec 000, apply kernel amendment 2026-07-26-apply-add-delta-placement-and-paths) —
 * an `op="added"` requirement lands beside its family-prefix siblings, never at the document's
 * first `</section>` (triage T-019).
 *
 * Placement is keyed on the new id's family prefix (the id with its trailing number stripped —
 * `NFR-`, `SC-`, `REQ-CHANGE-`), not on an enclosing `<section>`: insert immediately after the
 * *last* existing `<spec-requirement>` sharing that prefix. This must hold for both real layouts
 * in the corpus:
 *   - a downstream spec's shared `<section id="requirements">` with sibling `<h3>Functional</h3>` /
 *     `<h3>Non-functional</h3>` groups (019's actual layout) — keying on the enclosing `<section>`
 *     would insert at the section's end, after the wrong group.
 *   - the meta-spec's topic-grouped `REQ-<TOPIC>-<NNN>` ids, which carry no FR/NFR/SC vocabulary
 *     at all — a fixed FR/NFR/SC section map would gate-block every meta-spec ADD.
 * A first-of-kind id (no existing sibling shares its prefix) appends after the last
 * `<spec-requirement>` in the document rather than gate-blocking or guessing a position.
 *
 * Written red-first: today's `apply.ts` (`:104-112`) still anchors on `liveSpec.indexOf('</section>')`
 * — the document's first `</section>`, ignoring the requirement's kind entirely.
 */

import type { FileSystem, KernelContext } from '@spectastic/core';
import { applyCommand } from '@spectastic/core/commands/apply';
import { describe, expect, it } from 'vitest';

function stubFs(initial: Record<string, string>): {
  fs: FileSystem;
  files: Map<string, string>;
} {
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

// Mirrors 019's real shape: §1 Context (a decoy `</section>` an old, wrong implementation
// would target first) then one shared requirements section with Functional/Non-functional as
// sibling <h3> groups — not separate <section>s.
const SHARED_SECTION_SPEC = `<!doctype html><html><body>
<section id="context"><p>Some context prose.</p></section>
<section id="requirements">
<h3>Functional</h3>
<spec-requirement id="FR-001" priority="must"><p>First functional requirement.</p></spec-requirement>
<h3>Non-functional</h3>
<spec-requirement id="NFR-001" priority="must"><p>First non-functional requirement.</p></spec-requirement>
<spec-requirement id="NFR-002" priority="must"><p>Second non-functional requirement.</p></spec-requirement>
</section>
<section id="changelog"><spec-changelog><ol></ol></spec-changelog></section>
</body></html>`;

// Mirrors the meta-spec's real shape: one requirements section, topic-grouped, REQ-<TOPIC> ids —
// no FR/NFR/SC vocabulary anywhere.
const TOPIC_GROUPED_SPEC = `<!doctype html><html><body>
<section id="context"><p>Some context prose.</p></section>
<section id="requirements">
<h3>Change management</h3>
<spec-requirement id="REQ-CHANGE-006" priority="must"><p>Task fold.</p></spec-requirement>
<spec-requirement id="REQ-CHANGE-007" priority="should"><p>Deterministic fold.</p></spec-requirement>
<spec-requirement id="REQ-CHANGE-008" priority="should"><p>Kernel-authoritative apply.</p></spec-requirement>
<h3>Format</h3>
<spec-requirement id="REQ-FORMAT-001" priority="must"><p>A format rule.</p></spec-requirement>
</section>
<section id="changelog"><spec-changelog><ol></ol></spec-changelog></section>
</body></html>`;

function addProposal(newId: string, priority: string, text: string): string {
  return `<!doctype html><html><body>
<spec-change id="2026-01-01-add-${newId.toLowerCase()}" status="approved">
<spec-delta op="added" target="${newId}">
  <spec-requirement id="${newId}" priority="${priority}"><p>${text}</p></spec-requirement>
</spec-delta>
</spec-change>
</body></html>`;
}

describe('apply kernel — ADD placement keyed on family prefix (triage T-019)', () => {
  it('an added NFR-* lands immediately after the last existing NFR, in the 019 shared-<section> layout — not in §1 Context', async () => {
    const { fs, files } = stubFs({
      '/specs/019/spec.html': SHARED_SECTION_SPEC,
      '/specs/019/changes/2026-01-01-add-nfr-003/proposal.html': addProposal(
        'NFR-003',
        'must',
        'A new non-functional requirement.',
      ),
    });
    const ctx: KernelContext = { cwd: '', fs };

    const result = await applyCommand({ kind: 'apply', specId: '019', slug: '2026-01-01-add-nfr-003' }, ctx);

    expect(result.deltas[0]?.result).toBe('success');
    const updated = files.get('/specs/019/spec.html')!;

    // Never in §1 Context.
    const contextSection = updated.slice(
      updated.indexOf('<section id="context">'),
      updated.indexOf('</section>', updated.indexOf('<section id="context">')),
    );
    expect(contextSection).not.toContain('NFR-003');

    // Immediately after NFR-002, before the </section> that closes the requirements block.
    const idxNfr002 = updated.indexOf('id="NFR-002"');
    const idxNfr003 = updated.indexOf('id="NFR-003"');
    const idxRequirementsClose = updated.indexOf('</section>', updated.indexOf('<section id="requirements">'));
    expect(idxNfr002).toBeGreaterThan(-1);
    expect(idxNfr003).toBeGreaterThan(idxNfr002);
    expect(idxNfr003).toBeLessThan(idxRequirementsClose);
    // And strictly beside its NFR siblings, not after the whole section (no other
    // requirement's id sits between NFR-002 and NFR-003).
    const between = updated.slice(idxNfr002, idxNfr003);
    expect(between).not.toMatch(/id="(FR|REQ)-/);
  });

  it('an added REQ-CHANGE-* lands immediately after the last REQ-CHANGE-*, in the meta-spec topic-grouped layout — not in §1, not after a different topic', async () => {
    const { fs, files } = stubFs({
      '/specs/000/spec.html': TOPIC_GROUPED_SPEC,
      '/specs/000/changes/2026-01-01-add-change-009/proposal.html': addProposal(
        'REQ-CHANGE-009',
        'should',
        'A new change-management requirement.',
      ),
    });
    const ctx: KernelContext = { cwd: '', fs };

    const result = await applyCommand({ kind: 'apply', specId: '000', slug: '2026-01-01-add-change-009' }, ctx);

    expect(result.deltas[0]?.result).toBe('success');
    const updated = files.get('/specs/000/spec.html')!;

    const contextSection = updated.slice(
      updated.indexOf('<section id="context">'),
      updated.indexOf('</section>', updated.indexOf('<section id="context">')),
    );
    expect(contextSection).not.toContain('REQ-CHANGE-009');

    const idxChange008 = updated.indexOf('id="REQ-CHANGE-008"');
    const idxChange009 = updated.indexOf('id="REQ-CHANGE-009"');
    const idxFormat001 = updated.indexOf('id="REQ-FORMAT-001"');
    expect(idxChange008).toBeGreaterThan(-1);
    expect(idxChange009).toBeGreaterThan(idxChange008);
    // Lands before the Format group's requirement — beside its own topic, not after it.
    expect(idxChange009).toBeLessThan(idxFormat001);
  });

  it('a first-of-kind id (no existing sibling shares its prefix) appends after the last requirement in the document, not gate-blocked', async () => {
    const { fs, files } = stubFs({
      '/specs/019/spec.html': SHARED_SECTION_SPEC,
      '/specs/019/changes/2026-01-01-add-sc-001/proposal.html': addProposal(
        'SC-001',
        'must',
        'A first success criterion.',
      ),
    });
    const ctx: KernelContext = { cwd: '', fs };

    const result = await applyCommand({ kind: 'apply', specId: '019', slug: '2026-01-01-add-sc-001' }, ctx);

    // Must succeed, never gate-block, for a legitimate first-of-kind ADD.
    expect(result.deltas[0]?.result).toBe('success');
    const updated = files.get('/specs/019/spec.html')!;

    const idxNfr002 = updated.indexOf('id="NFR-002"');
    const idxSc001 = updated.indexOf('id="SC-001"');
    expect(idxSc001).toBeGreaterThan(idxNfr002);
  });
});
