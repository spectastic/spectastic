import type { FileSystem } from '@spectastic/core';
import { applyCommand } from '@spectastic/core/commands/apply';
import { describe, expect, it } from 'vitest';

// T-100..T-102 of specs/000-spectastic/tasks.html (REQ-CHANGE-007): the apply
// kernel's deterministic §6 task-fold + its fidelity post-condition.

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
      // no-op: the Map-based stub has no real directories.
    },
  };
  return { fs, files };
}

const SPEC = `<!doctype html><html><body>
<spec-requirement id="X-1" priority="must"><p>x</p></spec-requirement>
<section><spec-changelog><ol></ol></spec-changelog></section></body></html>`;

const TEMPLATE = `<!doctype html><html><head><link rel="stylesheet" href="../assets/spec.css"></head><body><main>
<section id="phase-setup" class="phase"><h2>1 · [PLACEHOLDER]</h2></section>
<section id="changelog"><h2>2 · Change log</h2><spec-changelog><ol></ol></spec-changelog></section>
</main></body></html>`;

const SLUG = '2026-06-26-demo';
const APPLY = { kind: 'apply' as const, specId: '000', slug: SLUG };

/** A proposal whose §6 carries the given task `<li>`s. */
function proposal(lis: string, title = 'Demo change'): string {
  return `<!doctype html><html><body><spec-change id="${SLUG}" status="approved"><h3>${title}</h3>
<section id="tasks"><h2>6 · Tasks</h2><p>intro</p><ul>${lis}</ul></section></spec-change></body></html>`;
}

/** A tracker wrapping the given phase sections, with a changelog. */
function tracker(phases: string): string {
  return `<!doctype html><html><body><main>
${phases}
<section id="changelog"><h2>2 · Change log</h2><spec-changelog><ol></ol></spec-changelog></section>
</main></body></html>`;
}

const phase = (taskId: string, extra = '') =>
  `<section id="phase-a" class="phase"><h2>1 · A</h2><spec-task id="${taskId}"${extra}><input type="checkbox" checked><div>old</div></spec-task></section>`;

const TWO_TASKS =
  '<li><input type="checkbox"> First [P] <span class="path">a/b.ts</span></li>' +
  '<li><input type="checkbox"> Second <span class="path">c/d.ts</span></li>';

describe('applyCommand §6 fold (REQ-CHANGE-007)', () => {
  it('transcribes every §6 item faithfully — path + [P]→parallel preserved', async () => {
    const { fs, files } = stubFs({
      '/specs/000/spec.html': SPEC,
      '/specs/000/tasks.html': tracker(phase('T-007')),
      [`/specs/000/changes/${SLUG}/proposal.html`]: proposal(TWO_TASKS),
    });
    const res = await applyCommand(APPLY, { cwd: '', fs });

    expect(res.foldedPhase?.taskIds).toEqual(['T-100', 'T-101']); // hundred-range above T-007
    const out = files.get('/specs/000/tasks.html')!;
    expect(out).toMatch(/<spec-task id="T-100" parallel>/); // [P] carried
    expect(out).toMatch(/<spec-task id="T-101">/);
    expect(out).not.toMatch(/<spec-task id="T-101"[^>]*parallel/); // not parallel
    expect(out).toContain('a/b.ts');
    expect(out).toContain('c/d.ts');
    expect(out).toContain(`<a href="./changes/archive/${SLUG}/proposal.html">`); // provenance
  });

  it('creates the tracker from the template when absent', async () => {
    const { fs, files } = stubFs({
      '/specs/000/spec.html': SPEC,
      '/templates/tasks.html': TEMPLATE,
      [`/specs/000/changes/${SLUG}/proposal.html`]: proposal(
        '<li><input type="checkbox"> Only <span class="path">x.ts</span></li>',
      ),
    });
    const res = await applyCommand(APPLY, { cwd: '', fs });

    expect(res.foldedPhase?.created).toBe(true);
    const out = files.get('/specs/000/tasks.html')!;
    expect(out).toContain('<spec-task id="T-100">'); // no prior tasks → hundred-range 100
    expect(out).not.toContain('[PLACEHOLDER]'); // template placeholder phase stripped
    expect(out).toContain('../../assets/spec.css'); // asset depth rewritten for specs/<id>/
  });

  it('continues IDs in a fresh hundred-range above the current max', async () => {
    const { fs, files } = stubFs({
      '/specs/000/spec.html': SPEC,
      '/specs/000/tasks.html': tracker(phase('T-118')),
      [`/specs/000/changes/${SLUG}/proposal.html`]: proposal(
        '<li><input type="checkbox"> One <span class="path">x.ts</span></li>',
      ),
    });
    const res = await applyCommand(APPLY, { cwd: '', fs });
    expect(res.foldedPhase?.taskIds).toEqual(['T-200']); // max 118 → next hundred-range 200
    expect(files.get('/specs/000/tasks.html')!).toContain('<spec-task id="T-200">');
  });

  it('completes a partial pre-existing phase rather than duplicating it', async () => {
    const partial =
      `<section id="phase-${SLUG}" class="phase"><h2>1 · Demo</h2>` +
      '<spec-task id="T-100"><input type="checkbox"><div>First <span class="path">a/b.ts</span></div></spec-task></section>';
    const { fs, files } = stubFs({
      '/specs/000/spec.html': SPEC,
      '/specs/000/tasks.html': tracker(partial),
      [`/specs/000/changes/${SLUG}/proposal.html`]: proposal(TWO_TASKS),
    });
    await applyCommand(APPLY, { cwd: '', fs });
    const out = files.get('/specs/000/tasks.html')!;
    expect((out.match(new RegExp(`id="phase-${SLUG}"`, 'g')) ?? []).length).toBe(1); // replaced, not duplicated
    expect(out).toContain('c/d.ts'); // the previously-missing second task is now present
  });

  it('empty §6 yields no phase and no tracker write', async () => {
    const { fs, files } = stubFs({
      '/specs/000/spec.html': SPEC,
      [`/specs/000/changes/${SLUG}/proposal.html`]: `<!doctype html><html><body><spec-change id="${SLUG}" status="approved"><h3>No tasks</h3></spec-change></body></html>`,
    });
    const res = await applyCommand(APPLY, { cwd: '', fs });
    expect(res.foldedPhase).toBeNull();
    expect(files.has('/specs/000/tasks.html')).toBe(false);
  });
});
