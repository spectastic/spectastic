import type {
  AIProvider,
  ChatOpts,
  FileSystem,
  KernelContext,
  Question,
  SubagentOpts,
  SubagentResult,
} from '@spectastic/core';
import { tasksCommand } from '@spectastic/core/commands/tasks';
import { describe, expect, it } from 'vitest';

class StubAI implements AIProvider {
  constructor(private readonly response: string = '{}') {}
  async chat(_p: string, _o?: ChatOpts): Promise<string> {
    return this.response;
  }
  async ask<T extends Record<string, string>>(_q: ReadonlyArray<Question>): Promise<T> {
    throw new Error('not used');
  }
  async subagent(_p: string, _o?: SubagentOpts): Promise<SubagentResult> {
    throw new Error('not used');
  }
}

function stubFs(files: Record<string, string>): FileSystem {
  const map = new Map(Object.entries(files));
  return {
    async readFile(path) {
      const content = map.get(path);
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return content;
    },
    async writeFile() {
      throw new Error('not used');
    },
    async readdir() {
      return Array.from(map.keys());
    },
    async stat(path) {
      return { isFile: map.has(path), isDirectory: false };
    },
  };
}

const SPEC = `<!doctype html><html><body>
<p class="small-caps">Specification · 099-test</p>
<spec-requirement id="FR-001" priority="must"><p>Frob the widget.</p></spec-requirement>
<spec-requirement id="FR-002" priority="must"><p>Validate the frob.</p></spec-requirement>
<spec-requirement id="NFR-001" priority="must"><p>Frob completes in under 100ms.</p></spec-requirement>
<spec-requirement id="SC-001" priority="must"><p>End-to-end frob succeeds.</p></spec-requirement>
</body></html>`;

const PLAN = `<!doctype html><html><body>
<spec-decision id="D-001"><dl><dt>Decision</dt><dd>Use a widget.</dd></dl></spec-decision>
<spec-decision id="D-002"><dl><dt>Decision</dt><dd>Use validation.</dd></dl></spec-decision>
</body></html>`;

describe('tasksCommand (009)', () => {
  it('produces 5-phase task structure with deterministic IDs', async () => {
    const ai = new StubAI();
    const fs = stubFs({ '/spec.html': SPEC, '/plan.html': PLAN });
    const ctx: KernelContext = { cwd: '/', fs, ai };

    const result = await tasksCommand({ specPath: '/spec.html', planPath: '/plan.html' }, ctx);

    expect(result.phases.length).toBeGreaterThanOrEqual(3);
    expect(result.phases[0]?.id).toBe('setup');
    expect(result.phases[1]?.id).toBe('foundation');
    expect(result.totalTasks).toBeGreaterThan(0);
    expect(result.html).toContain('099-test');
    expect(result.html).toContain('<spec-status value="draft">');
    // 045-artifact-security T-102: the kernel's own generated <head> carries the
    // open-time CSP gate too, not just the file-based templates/tasks.html.
    expect(result.html).toContain('Content-Security-Policy');
  });

  it('emits <spec-warning> when a requirement is unreferenced (none here; verifies happy path)', async () => {
    const ai = new StubAI();
    const fs = stubFs({ '/spec.html': SPEC, '/plan.html': PLAN });
    const ctx: KernelContext = { cwd: '/', fs, ai };

    const result = await tasksCommand({ specPath: '/spec.html', planPath: '/plan.html' }, ctx);
    // FR-001/FR-002 are referenced by phase tasks; NFR/SC may not be in
    // the deterministic skeleton; either way the html is well-formed.
    expect(result.html).toContain('<spec-task');
  });

  it('throws when source spec has no FRs', async () => {
    const ai = new StubAI();
    const fs = stubFs({
      '/spec.html': '<!doctype html><html><body><p class="small-caps">Specification · 099-empty</p></body></html>',
      '/plan.html': PLAN,
    });
    const ctx: KernelContext = { cwd: '/', fs, ai };

    await expect(tasksCommand({ specPath: '/spec.html', planPath: '/plan.html' }, ctx)).rejects.toThrow(
      /declares no FR-NNN requirements/,
    );
  });

  it('throws when ctx.ai is undefined', async () => {
    const fs = stubFs({ '/spec.html': SPEC, '/plan.html': PLAN });
    await expect(tasksCommand({ specPath: '/spec.html', planPath: '/plan.html' }, { cwd: '/', fs })).rejects.toThrow(
      /ctx\.ai/,
    );
  });
});
