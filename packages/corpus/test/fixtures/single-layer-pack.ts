import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { renderIndexTable } from '../../src/knowledge/index-format.js';
import type { IndexEntry } from '../../src/knowledge/types.js';

/**
 * Test fixture builders for 066-corpus-single-layer-retire (T-001): a
 * pre-062 single-layer pack (`id:` documents + a pack-local `index.md`, no
 * root registry) and a bare two-layer document writer for building mixed
 * packs. Shared by the migrate tests (which need a real filesystem to
 * rewrite) and the validate tests (which build a real single-layer pack to
 * assert the deprecation warning fires end-to-end via `loadCorpus`).
 */

const FULL_PROVENANCE: Record<string, string> = {
  origin: 'TODO',
  'origin-url': 'TODO',
  edition: 'TODO',
  license: 'TODO',
  converter: 'TODO',
  'content-hash': `sha256:${'0'.repeat(64)}`,
  status: 'TODO',
};

export interface SingleLayerDoc {
  id: string;
  body: string;
  title?: string;
  description?: string;
  provenance?: Record<string, string>;
}

/** A fresh temp project root under the OS tmp dir. Caller is responsible for
 * `rmSync(root, { recursive: true, force: true })` in `afterEach`. */
export function tempProjectRoot(): string {
  return mkdtempSync(join(tmpdir(), 'spectastic-single-layer-'));
}

/** Write a pre-062 single-layer pack under `<cwd>/knowledge/<pack>/`: each
 * entry in `docs` (keyed by filename, e.g. `alpha.md`) becomes a document
 * carrying `id:` frontmatter (never `slug:`), and the pack gets its own
 * `index.md` — the shape `migratePack` converts and the deprecation warning
 * flags. No root registry, no `SKILL.md` (a genuinely un-migrated pack has
 * neither yet). */
export function writeSingleLayerPack(cwd: string, pack: string, docs: Record<string, SingleLayerDoc>): void {
  const packDir = join(cwd, 'knowledge', pack);
  const referencesDir = join(packDir, 'references');
  mkdirSync(referencesDir, { recursive: true });

  const rows: IndexEntry[] = [];
  for (const [filename, d] of Object.entries(docs)) {
    const provenance = { ...FULL_PROVENANCE, ...d.provenance };
    const yamlBlock = stringifyYaml({ id: d.id, ...provenance }).trimEnd();
    writeFileSync(join(referencesDir, filename), `---\n${yamlBlock}\n---\n\n${d.body}\n`, 'utf8');
    rows.push({
      id: d.id,
      title: d.title ?? d.id,
      description: d.description ?? '',
      edition: provenance.edition ?? 'TODO',
      path: `references/${filename}`,
    });
  }
  writeFileSync(join(packDir, 'index.md'), renderIndexTable(rows), 'utf8');
}

/** Write one already-two-layer document directly (bypassing `registerDocument`
 * — no registry row, no SKILL.md) — used to build a *mixed* pack alongside
 * `writeSingleLayerPack`'s `id:` documents, so a migrate/validate test can
 * assert an already-`slug:` document is left untouched. */
export function writeTwoLayerDoc(
  cwd: string,
  pack: string,
  slug: string,
  body: string,
  provenance: Record<string, string> = {},
): void {
  const referencesDir = join(cwd, 'knowledge', pack, 'references');
  mkdirSync(referencesDir, { recursive: true });
  const yamlBlock = stringifyYaml({ slug, ...{ ...FULL_PROVENANCE, ...provenance } }).trimEnd();
  writeFileSync(join(referencesDir, `${slug}.md`), `---\n${yamlBlock}\n---\n\n${body}\n`, 'utf8');
}
