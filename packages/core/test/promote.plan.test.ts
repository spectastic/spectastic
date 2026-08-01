import type { FileSystem } from '@spectastic/core';
import { planPromotion } from '@spectastic/core/contracts/promote';
import { describe, expect, it } from 'vitest';

/**
 * planPromotion() — spec 071-contract-promotion. Pure and read-only: it
 * returns writes/archives/conflicts without touching disk (design D-003),
 * which is what makes atomicity, idempotence and the dry-run all fall out of
 * one structure.
 */

function stubFs(initial: Record<string, string>): FileSystem {
  const files = new Map(Object.entries(initial));
  return {
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
      // no-op — flat map, not a real tree
    },
  };
}

const DESIGN_ONE_CONTRACT = `<!doctype html><html><body>
<spec-contract shape="request-response" path="api/openapi.yaml" format="OpenAPI"><p>reasoning</p></spec-contract>
</body></html>`;

describe('planPromotion (071)', () => {
  it("T-100: compares baseline-versus-current, not incoming-versus-current — the design's headline trap", async () => {
    // Incoming (proposed) content DIFFERS from the current effective file — that
    // is expected, it's the whole point of promoting. The baseline MATCHES the
    // current effective file, so nothing has moved underneath the proposal —
    // this MUST promote. Getting the comparison backwards (incoming-vs-current)
    // would refuse this and every other legitimate promotion.
    const fs = stubFs({
      '/repo/specs/300-x/design.html': DESIGN_ONE_CONTRACT,
      '/repo/api/openapi.yaml': 'openapi: 3.0.0\ninfo: {title: v1}\n', // current effective
      '/repo/specs/300-x/contracts/openapi.yaml': 'openapi: 3.0.0\ninfo: {title: v2}\n', // incoming — differs
      '/repo/specs/300-x/contracts/.baseline/openapi.yaml': 'openapi: 3.0.0\ninfo: {title: v1}\n', // baseline — matches current
    });

    const plan = await planPromotion('300-x', '2026-08-01-x', fs, '/repo');

    expect(plan.conflicts).toHaveLength(0);
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0]).toEqual({
      from: '/repo/specs/300-x/contracts/openapi.yaml',
      to: '/repo/api/openapi.yaml',
    });
  });

  it('T-101: lists one write and one archive per proposed contract', async () => {
    const fs = stubFs({
      '/repo/specs/301-y/design.html': DESIGN_ONE_CONTRACT,
      '/repo/api/openapi.yaml': 'v1',
      '/repo/specs/301-y/contracts/openapi.yaml': 'v2',
      '/repo/specs/301-y/contracts/.baseline/openapi.yaml': 'v1',
    });

    const plan = await planPromotion('301-y', '2026-08-01-y', fs, '/repo');

    expect(plan.writes).toHaveLength(1);
    expect(plan.archives).toHaveLength(1);
    expect(plan.archives[0]?.from).toBe('/repo/specs/301-y/contracts/openapi.yaml');
    expect(plan.archives[0]?.to).toBe(
      '/repo/specs/301-y/changes/archive/2026-08-01-y/contracts/openapi.yaml',
    );
    expect(plan.archives[0]?.baselineFrom).toBe('/repo/specs/301-y/contracts/.baseline/openapi.yaml');
  });

  it('T-101: is empty for a change carrying no proposed contract (FR-006)', async () => {
    const fs = stubFs({
      '/repo/specs/302-z/design.html': DESIGN_ONE_CONTRACT,
      '/repo/api/openapi.yaml': 'v1',
      // no specs/302-z/contracts/openapi.yaml at all
    });

    const plan = await planPromotion('302-z', '2026-08-01-z', fs, '/repo');

    expect(plan.writes).toHaveLength(0);
    expect(plan.archives).toHaveLength(0);
    expect(plan.conflicts).toHaveLength(0);
  });

  it('T-202: a three-contract change where the third conflicts writes and archives nothing (FR-004 atomicity)', async () => {
    const design = `<!doctype html><html><body>
<spec-contract shape="request-response" path="api/a.yaml" format="OpenAPI"><p>a</p></spec-contract>
<spec-contract shape="request-response" path="api/b.yaml" format="OpenAPI"><p>b</p></spec-contract>
<spec-contract shape="request-response" path="api/c.yaml" format="OpenAPI"><p>c</p></spec-contract>
</body></html>`;
    const fs = stubFs({
      '/repo/specs/303-three/design.html': design,
      '/repo/api/a.yaml': 'a1',
      '/repo/api/b.yaml': 'b1',
      '/repo/api/c.yaml': 'c3', // moved since baseline
      '/repo/specs/303-three/contracts/a.yaml': 'a2',
      '/repo/specs/303-three/contracts/b.yaml': 'b2',
      '/repo/specs/303-three/contracts/c.yaml': 'c2',
      '/repo/specs/303-three/contracts/.baseline/a.yaml': 'a1', // matches
      '/repo/specs/303-three/contracts/.baseline/b.yaml': 'b1', // matches
      '/repo/specs/303-three/contracts/.baseline/c.yaml': 'c1', // stale — c diverged
    });

    const plan = await planPromotion('303-three', '2026-08-01-three', fs, '/repo');

    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]?.path).toBe('api/c.yaml');
    expect(plan.writes).toHaveLength(0);
    expect(plan.archives).toHaveLength(0);
  });

  it('T-300: a moved destination refuses, naming the conflicting path (FR-003/FR-007)', async () => {
    const fs = stubFs({
      '/repo/specs/304-conflict/design.html': DESIGN_ONE_CONTRACT,
      '/repo/api/openapi.yaml': 'v3', // moved since baseline was captured
      '/repo/specs/304-conflict/contracts/openapi.yaml': 'v2',
      '/repo/specs/304-conflict/contracts/.baseline/openapi.yaml': 'v1',
    });

    const plan = await planPromotion('304-conflict', '2026-08-01-conflict', fs, '/repo');

    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]?.path).toBe('api/openapi.yaml');
    expect(plan.conflicts[0]?.reason).toMatch(/api\/openapi\.yaml/);
    expect(plan.writes).toHaveLength(0);
    expect(plan.archives).toHaveLength(0);
  });

  it('T-301: no baseline and no effective file promotes — a project\'s first contract (D-005)', async () => {
    const design = DESIGN_ONE_CONTRACT.replace('api/openapi.yaml', 'api/new.proto');
    const fs = stubFs({
      '/repo/specs/305-first/design.html': design,
      '/repo/specs/305-first/contracts/new.proto': 'syntax = "proto3";',
      // no /repo/api/new.proto, no baseline
    });

    const plan = await planPromotion('305-first', '2026-08-01-first', fs, '/repo');

    expect(plan.conflicts).toHaveLength(0);
    expect(plan.writes).toHaveLength(1);
  });

  it('T-301: no baseline but an existing effective file refuses — something else created it (D-005)', async () => {
    const design = DESIGN_ONE_CONTRACT.replace('api/openapi.yaml', 'api/new.proto');
    const fs = stubFs({
      '/repo/specs/306-race/design.html': design,
      '/repo/specs/306-race/contracts/new.proto': 'syntax = "proto3";',
      '/repo/api/new.proto': 'syntax = "proto3"; // someone else landed first',
      // no baseline recorded
    });

    const plan = await planPromotion('306-race', '2026-08-01-race', fs, '/repo');

    expect(plan.conflicts).toHaveLength(1);
    expect(plan.writes).toHaveLength(0);
  });

  it('is empty when the design carries no contract at all (shape="none")', async () => {
    const design = `<!doctype html><html><body><spec-contract shape="none"><p>none</p></spec-contract></body></html>`;
    const fs = stubFs({ '/repo/specs/307-none/design.html': design });

    const plan = await planPromotion('307-none', '2026-08-01-none', fs, '/repo');

    expect(plan.writes).toHaveLength(0);
    expect(plan.archives).toHaveLength(0);
    expect(plan.conflicts).toHaveLength(0);
  });

  it('is empty when the spec has no design.html at all', async () => {
    const fs = stubFs({});

    const plan = await planPromotion('308-nodesign', '2026-08-01-nodesign', fs, '/repo');

    expect(plan.writes).toHaveLength(0);
    expect(plan.archives).toHaveLength(0);
    expect(plan.conflicts).toHaveLength(0);
  });
});
