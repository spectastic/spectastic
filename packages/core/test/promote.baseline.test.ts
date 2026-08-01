import type { AIProvider, FileSystem, KernelContext, Question, SubagentOpts, SubagentResult } from '@spectastic/core';
import { proposeCommand } from '@spectastic/core/commands/propose';
import { describe, expect, it } from 'vitest';

/**
 * Baseline capture at propose time (spec 071-contract-promotion, T-010).
 * FR-003's conflict check is impossible without a recorded baseline — design
 * D-001: a verbatim copy of the effective contract, written at authoring
 * time, at specs/<id>/contracts/.baseline/<name>. D-005: an *absent*
 * baseline records "no effective contract existed at authoring time", a
 * distinct and legal state — so no-effective-file MUST NOT write a baseline.
 */

class StubAI implements AIProvider {
  async chat(): Promise<string> {
    return JSON.stringify({ intent: 'x', scope: 'x', approach: 'x', deltas: [] });
  }
  async ask<TResult extends Record<string, string>>(_questions: ReadonlyArray<Question>): Promise<TResult> {
    throw new Error('not used');
  }
  async subagent(_prompt: string, _opts?: SubagentOpts): Promise<SubagentResult> {
    throw new Error('not used');
  }
}

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
      // no-op — the stub is a flat map, not a real tree
    },
  };
  return { fs, files };
}

const DESIGN_WITH_CONTRACT = `<!doctype html><html><body>
<spec-contract shape="request-response" path="api/openapi.yaml" format="OpenAPI">
  <p>reasoning</p>
</spec-contract>
</body></html>`;

const DESIGN_NO_CONTRACT = `<!doctype html><html><body>
<spec-contract shape="none"><p>no interface</p></spec-contract>
</body></html>`;

describe('propose-time baseline capture (071, D-001/D-005)', () => {
  it('copies the current effective file to the baseline location when one is declared and exists', async () => {
    const { fs, files } = stubFs({
      '/repo/specs/300-x/design.html': DESIGN_WITH_CONTRACT,
      '/repo/api/openapi.yaml': 'openapi: 3.0.0\ninfo: {title: v1}\n',
    });
    const ctx: KernelContext = { cwd: '/repo', fs, ai: new StubAI() };

    await proposeCommand({ specId: '300-x', description: 'bump contract', specHtml: '<html></html>' }, ctx);

    expect(files.get('/repo/specs/300-x/contracts/.baseline/openapi.yaml')).toBe('openapi: 3.0.0\ninfo: {title: v1}\n');
  });

  it('writes no baseline file when no effective file exists yet (D-005: absence is the signal)', async () => {
    const { fs, files } = stubFs({
      '/repo/specs/301-first/design.html': DESIGN_WITH_CONTRACT.replace('api/openapi.yaml', 'api/new.proto'),
    });
    const ctx: KernelContext = { cwd: '/repo', fs, ai: new StubAI() };

    await proposeCommand({ specId: '301-first', description: 'first contract', specHtml: '<html></html>' }, ctx);

    expect(files.has('/repo/specs/301-first/contracts/.baseline/new.proto')).toBe(false);
  });

  it('writes no baseline file when the design declares no contract (shape="none")', async () => {
    const { fs, files } = stubFs({
      '/repo/specs/302-plain/design.html': DESIGN_NO_CONTRACT,
    });
    const ctx: KernelContext = { cwd: '/repo', fs, ai: new StubAI() };

    await proposeCommand({ specId: '302-plain', description: 'no interface', specHtml: '<html></html>' }, ctx);

    const baselineKeys = [...files.keys()].filter((k) => k.includes('.baseline'));
    expect(baselineKeys).toHaveLength(0);
  });

  it('does nothing when the target spec has no design.html yet', async () => {
    const { fs, files } = stubFs({});
    const ctx: KernelContext = { cwd: '/repo', fs, ai: new StubAI() };

    await proposeCommand({ specId: '303-nodesign', description: 'x', specHtml: '<html></html>' }, ctx);

    expect(files.size).toBe(0);
  });
});
