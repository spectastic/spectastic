import { describe, expect, it } from 'vitest';
import { tasksCommand } from '@spectastic/core/commands/tasks';
import type { AIProvider, FileSystem, KernelContext } from '@spectastic/core';

// T-100 (US1, tracer) + T-200 (US2, spike) of spec 024-explore-restore: restore
// generation seeds the prompt by classification (FR-002/FR-003), banners the
// classification (FR-005/SC-002), opens test-first (SC-002), and ALWAYS emits the
// spike prototype-deletion task (SC-003) — even when the AI enrichment fails.

const SPEC = `<!doctype html><html lang="en"><body><main>
<header><p class="small-caps">Specification · 019-demo</p><h1>Demo</h1>
<spec-meta><b>Spec ID</b><span>019-demo</span></spec-meta></header>
<section id="requirements">
<spec-requirement id="FR-001" priority="must"><p>The system <spec-rule>MUST</spec-rule> do A.</p></spec-requirement>
<spec-requirement id="FR-002" priority="must"><p>The system <spec-rule>MUST</spec-rule> do B.</p></spec-requirement>
</section>
<section id="success">
<spec-requirement id="SC-001" priority="must"><p>A works end to end.</p></spec-requirement>
</section></main></body></html>`;
const PLAN = `<!doctype html><html lang="en"><body><main><h1>plan</h1></main></body></html>`;

function harness(reply: string): { ctx: KernelContext; prompts: string[] } {
  const prompts: string[] = [];
  const ai: AIProvider = {
    async chat(prompt) {
      prompts.push(prompt);
      return reply;
    },
    async ask() {
      return {} as never;
    },
    async subagent() {
      return { output: '' };
    },
  };
  const fs: FileSystem = {
    async readFile(p) {
      return p.endsWith('spec.html') ? SPEC : PLAN;
    },
    async writeFile() {},
    async readdir() {
      return [];
    },
    async stat() {
      return { isFile: true, isDirectory: false };
    },
    async rename() {},
    async rm() {},
    async mkdir() {},
  };
  return { ctx: { cwd: '/p', fs, ai }, prompts };
}

const paths = {
  specPath: '/p/specs/019-demo/spec.html',
  planPath: '/p/specs/019-demo/plan.html',
};
const ARCHIVE = 'explorations/archive/019-demo';

describe('tasksCommand restore mode (024-explore-restore)', () => {
  it('tracer-bullet seeds a refactor-to-comply prompt and banners the classification (FR-002, FR-005, SC-002)', async () => {
    const { ctx, prompts } = harness('{ "FR-001": "Bring A to comply", "FR-002": "Bring B to comply" }');
    const r = await tasksCommand(
      { ...paths, restore: { classification: 'tracer-bullet', sourceArchive: ARCHIVE } },
      ctx,
    );
    const prompt = prompts.join('\n');
    expect(prompt).toMatch(/tracer-bullet/);
    expect(prompt).toMatch(/refactor-to-comply/);
    // FR-005 / SC-002: a banner names the classification + the source archive.
    expect(r.html).toMatch(/Restore tasks · tracer-bullet/);
    expect(r.html).toContain(ARCHIVE);
    // SC-002: test-first — a failing-tests task leads.
    expect(r.html).toMatch(/Write failing tests/);
    // tracer keeps the build: no prototype-deletion task.
    expect(r.html).not.toMatch(/Delete the discarded prototype/);
  });

  it('spike seeds a clean-rebuild prompt and ALWAYS emits the prototype-deletion task — even when enrichment fails (FR-003, SC-003)', async () => {
    // The stub returns non-JSON: enrichment is best-effort and falls back to the
    // deterministic skeleton. SC-003 must hold regardless of the AI.
    const { ctx, prompts } = harness('the model returned prose, not JSON');
    const r = await tasksCommand(
      { ...paths, restore: { classification: 'spike', sourceArchive: ARCHIVE } },
      ctx,
    );
    const prompt = prompts.join('\n');
    expect(prompt).toMatch(/spike/);
    expect(prompt).toMatch(/clean-rebuild/);
    expect(r.html).toMatch(/Restore tasks · spike/);
    // SC-003: the deletion task is present despite the failed enrichment.
    expect(r.html).toMatch(/Delete the discarded prototype/);
    expect(r.html).toContain(ARCHIVE);
    expect(r.html).toMatch(/Write failing tests/);
  });

  it('the normal (non-restore) path is unchanged — no banner', async () => {
    const { ctx } = harness('{}');
    const r = await tasksCommand(paths, ctx);
    expect(r.html).not.toMatch(/Restore tasks ·/);
  });
});
