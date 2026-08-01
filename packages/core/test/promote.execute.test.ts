import type { FileSystem } from '@spectastic/core';
import { executePromotion, planPromotion } from '@spectastic/core/contracts/promote';
import { describe, expect, it } from 'vitest';

/**
 * executePromotion() — spec 071-contract-promotion. Applies an already-
 * conflict-free plan: write the effective contract first, archive second
 * (the fail-safe ordering apply's own archive step already documents).
 */

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
      // no-op — flat map, not a real tree
    },
  };
  return { fs, files };
}

const DESIGN_ONE_CONTRACT = `<!doctype html><html><body>
<spec-contract shape="request-response" path="api/openapi.yaml" format="OpenAPI"><p>reasoning</p></spec-contract>
</body></html>`;

describe('executePromotion (071)', () => {
  it('T-102: writes the effective file and archives the proposal beside its proposal.html', async () => {
    const { fs, files } = stubFs({
      '/repo/specs/400-x/design.html': DESIGN_ONE_CONTRACT,
      '/repo/api/openapi.yaml': 'v1',
      '/repo/specs/400-x/contracts/openapi.yaml': 'v2',
      '/repo/specs/400-x/contracts/.baseline/openapi.yaml': 'v1',
      '/repo/specs/400-x/changes/2026-08-01-x/proposal.html': '<html>proposal</html>',
    });

    const plan = await planPromotion('400-x', '2026-08-01-x', fs, '/repo');
    await executePromotion(plan, fs);

    expect(files.get('/repo/api/openapi.yaml')).toBe('v2');
    expect(files.has('/repo/specs/400-x/contracts/openapi.yaml')).toBe(false);
    expect(files.get('/repo/specs/400-x/changes/archive/2026-08-01-x/contracts/openapi.yaml')).toBe('v2');
    expect(files.get('/repo/specs/400-x/changes/archive/2026-08-01-x/contracts/.baseline/openapi.yaml')).toBe('v1');
  });

  it('T-200: leaves exactly one readable contract for the interface — nothing readable remains proposed', async () => {
    const { fs, files } = stubFs({
      '/repo/specs/401-y/design.html': DESIGN_ONE_CONTRACT,
      '/repo/api/openapi.yaml': 'v1',
      '/repo/specs/401-y/contracts/openapi.yaml': 'v2',
      '/repo/specs/401-y/contracts/.baseline/openapi.yaml': 'v1',
    });

    const plan = await planPromotion('401-y', '2026-08-01-y', fs, '/repo');
    await executePromotion(plan, fs);

    const readableCopies = [...files.keys()].filter(
      (k) => k.endsWith('openapi.yaml') && !k.includes('changes/archive'),
    );
    // Exactly the effective path — the spec-local proposed copy is gone.
    expect(readableCopies).toEqual(['/repo/api/openapi.yaml']);
  });

  it('T-201: a second run after success changes 0 files and exits zero (idempotence, FR-005)', async () => {
    const { fs, files } = stubFs({
      '/repo/specs/402-z/design.html': DESIGN_ONE_CONTRACT,
      '/repo/api/openapi.yaml': 'v1',
      '/repo/specs/402-z/contracts/openapi.yaml': 'v2',
      '/repo/specs/402-z/contracts/.baseline/openapi.yaml': 'v1',
    });

    const firstPlan = await planPromotion('402-z', '2026-08-01-z', fs, '/repo');
    await executePromotion(firstPlan, fs);
    const snapshot = new Map(files);

    const secondPlan = await planPromotion('402-z', '2026-08-01-z', fs, '/repo');
    expect(secondPlan.writes).toHaveLength(0);
    expect(secondPlan.archives).toHaveLength(0);
    expect(secondPlan.conflicts).toHaveLength(0);
    await expect(executePromotion(secondPlan, fs)).resolves.toBeUndefined();

    expect(files).toEqual(snapshot);
  });

  it('a change with no proposed contract at all is a total no-op (FR-006)', async () => {
    const { fs, files } = stubFs({
      '/repo/specs/403-none/design.html': `<!doctype html><html><body><spec-contract shape="none"><p>none</p></spec-contract></body></html>`,
    });
    const before = new Map(files);

    const plan = await planPromotion('403-none', '2026-08-01-none', fs, '/repo');
    await executePromotion(plan, fs);

    expect(files).toEqual(before);
  });

  it('executePromotion throws rather than write when handed a plan carrying conflicts', async () => {
    const { fs } = stubFs({});
    await expect(
      executePromotion({ writes: [], archives: [], conflicts: [{ path: 'api/x.yaml', reason: 'x' }] }, fs),
    ).rejects.toThrow(/refus/i);
  });
});
