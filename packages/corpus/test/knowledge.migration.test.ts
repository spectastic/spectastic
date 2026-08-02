import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRegistry } from '../src/knowledge/index-format.js';
import { allocateRegistryIds, mergeRegistryRows } from '../src/knowledge/ingest.js';
import { KB_ID_RE } from '../src/knowledge/types.js';

/**
 * 062-corpus-identity-migration — regression tests over the COMMITTED migration
 * artifacts (US1 register / US2 re-point). These read the real repo files, so
 * they fail if a later edit un-migrates a pack, duplicates a KB-NNNN, or
 * reintroduces a three-digit id — the proof leg for SC-001 / SC-003 / SC-004
 * the verify view traces (021 FR-003).
 */

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const registryPath = join(REPO_ROOT, 'knowledge', 'index.md');
const registry = parseRegistry(readFileSync(registryPath, 'utf8'));

describe('062 migration — the root registry (SC-001)', () => {
  it('holds exactly the two migrated rows, each a four-digit repo-unique KB-NNNN', () => {
    expect(registry.map((r) => r.id).sort()).toEqual(['KB-0001', 'KB-0002']);
    for (const row of registry) {
      expect(row.id).toMatch(/^KB-\d{4}$/); // four-digit, opaque
      expect(KB_ID_RE.test(row.id)).toBe(true);
    }
    const ids = registry.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length); // repo-unique
  });

  it('files each pack under its expected (marketplace, plugin, slug) coordinate', () => {
    // Marketplaces became owner-qualified on 02 Aug 2026, resolving
    // TBD-corpus-owner-config: `corpus.marketplace` was un-pinned so it derives
    // from the owner-qualified `project` (067 FR-006's unified identity), and
    // both committed rows were re-keyed to match. A bare marketplace is
    // collision-prone the moment the estate is federated, which is exactly what
    // the coordinate scheme exists to prevent.
    const byId = new Map(registry.map((r) => [r.id, r]));
    expect(byId.get('KB-0001')).toMatchObject({
      marketplace: 'spectastic/spectastic',
      plugin: 'spectastic-concepts',
      slug: '001-foundations',
    });
    expect(byId.get('KB-0002')).toMatchObject({
      marketplace: 'spectastic/spectastic-examples',
      plugin: 'finance-settlement',
      slug: '001-settlement-windows',
    });
  });

  it('every committed marketplace is owner-qualified, so no coordinate can collide', () => {
    // The property the re-key exists for, pinned independently of the two
    // literals above: a future row added with a bare marketplace fails here even
    // if it never touches the assertions.
    for (const row of registry) {
      expect(row.marketplace, `${row.id} must carry an owner-qualified marketplace`).toMatch(
        /^[^/]+\/[^/]+$/,
      );
    }
  });
});

describe('062 migration — allocation never reuses, merge is idempotent (SC-003)', () => {
  it('allocates the next id monotonically past the highest committed one', () => {
    // Never-reuse: with KB-0001/KB-0002 committed, the next allocation is KB-0003.
    expect(allocateRegistryIds(registry, 1)).toEqual(['KB-0003']);
  });

  it('re-merging the committed rows into themselves is a no-op (idempotent re-import proxy)', () => {
    const merged = mergeRegistryRows(registry, registry);
    expect(merged.map((r) => r.id).sort()).toEqual(['KB-0001', 'KB-0002']);
  });
});

describe('062 migration — both packs are two-layer, no three-digit id survives (SC-004)', () => {
  it('every migrated reference carries slug: frontmatter and no pack-minted id:', () => {
    for (const row of registry) {
      // row.path is corpus-root-relative (062 triage T-002), so join it under the base.
      const docPath = join(REPO_ROOT, 'knowledge', row.path);
      expect(existsSync(docPath), `${row.path} exists`).toBe(true);
      const frontmatter = readFileSync(docPath, 'utf8').split('---')[1] ?? '';
      expect(frontmatter).toMatch(/\bslug:/);
      expect(frontmatter).not.toMatch(/^id:/m);
    }
  });

  it('no per-pack index.md remains under a migrated pack', () => {
    for (const row of registry) {
      const packDir = join(REPO_ROOT, 'knowledge', row.plugin);
      expect(existsSync(join(packDir, 'index.md')), `${row.plugin}/index.md removed`).toBe(false);
    }
  });
});

describe('062 migration — corpus role superseded by 063 (FR-009 retracted)', () => {
  it('carries a real root marketplace.json — discoverable-by-default (063 FR-007) supersedes the earlier consumer-only decision', () => {
    // 062 FR-009 originally recorded this repo as consumer-only (no root
    // marketplace.json). 063-corpus-discoverability's whole point is to
    // retract that: the meta-repo now dogfoods discoverable-by-default
    // (T-312), with the formal MODIFY-FR-009 propose on 062 as T-322's
    // follow-on. This assertion flips with the code, not after it.
    expect(existsSync(join(REPO_ROOT, 'knowledge', 'marketplace.json'))).toBe(true);
  });
});

describe('062 triage T-002 — registry paths are corpus-root-relative, base overridable', () => {
  it('stores each path relative to the corpus root (no hard-coded knowledge/ prefix), starting at the plugin', () => {
    for (const row of registry) {
      expect(row.path.startsWith('knowledge/'), `${row.id} path must not hard-code the base`).toBe(false);
      expect(row.path.startsWith(`${row.plugin}/references/`), `${row.id} path is <plugin>/references/…`).toBe(true);
    }
  });
});
