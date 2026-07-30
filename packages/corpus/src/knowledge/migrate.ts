/**
 * corpus migrate (066-corpus-single-layer-retire, plan D-002/D-003).
 *
 * Converts an existing single-layer pack (pre-062: a document `id:` +
 * a pack-local `index.md`) to the two-layer convention **in place** —
 * re-filing every single-layer document through the same `registerDocument`
 * backbone `adapt` and `convert` use (D-001), never a parallel filing path.
 *
 * Idempotent and mixed-pack-safe: a document already carrying `slug:` is
 * left completely untouched, so a second run — or a run on a pack that's
 * already two-layer, or a pack with some documents already migrated — is
 * either a full no-op or converts only what's left (D-002).
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { deriveTitleAndDescription, TODO } from './adapt.js';
import { parseIndex } from './index-format.js';
import { registerDocument } from './ingest.js';
import { parseCorpusDocument } from './parse.js';
import type { CorpusDocument, CorpusPack, IndexEntry, ParsedCorpusDocument } from './types.js';

const REFERENCES_DIR = 'references';
const INDEX_FILE = 'index.md';

/** Every document in a loaded pack still carrying a pack-minted `id:` with
 * no `slug:` — the per-document single-layer signal (plan D-003). */
export function singleLayerDocuments(pack: CorpusPack): CorpusDocument[] {
  return pack.documents.filter((d) => d.id !== null && !d.slug);
}

/** Whether a loaded pack still carries ANY single-layer signal — a
 * single-layer document, or a non-empty pack-local index (plan D-003). The
 * one predicate `migratePack` and the validate deprecation rule (US3) both
 * read, so the two can never disagree on where the boundary sits. */
export function isSingleLayerPack(pack: CorpusPack): boolean {
  return singleLayerDocuments(pack).length > 0 || pack.index.length > 0;
}

export interface MigrateInput {
  /** Absolute path to the project's `knowledge/` directory. */
  knowledgeDir: string;
  /** The pack name under `knowledgeDir` to migrate. */
  pack: string;
  /** This corpus's own publish identity — the `marketplace` column every
   * newly-registered row is filed under (matches `adapt`/`convert`). */
  marketplace: string;
  /** Kept in sync with `marketplace.json`, same role as every other
   * `registerDocument` caller's field of the same name. Optional: a caller
   * with no corpus identity configured gets no sync side effect. */
  corpusMarketplaceName?: string;
}

export interface MigrateResult {
  pack: string;
  /** `KB-NNNN` ids newly registered this run — one per migrated document,
   * always freshly allocated, never the document's old pack-local `id:`
   * (FR-003). */
  migrated: string[];
  /** Filenames already two-layer (`slug:`), left completely untouched. */
  skipped: string[];
}

/** A URL/filename-safe slug body — mirrors `convert.ts`'s own `slugify`
 * (065); duplicated rather than shared so this spec's diff stays scoped to
 * `migrate.ts`'s own new module. */
function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'document'
  );
}

/** Derive the pack-internal slug for a migrating document (plan D-002):
 * keep an existing `NNN-` prefix from its CURRENT single-layer filename when
 * that ordinal isn't already taken (by an already-two-layer sibling in the
 * same pack), else allocate the next free ordinal. Distinct from `convert`'s
 * `deriveConvertSlug`, which always derives fresh — a migrating document
 * already has a stable position in its pack, worth preserving rather than
 * re-deriving. */
function deriveMigrateSlug(usedSlugs: ReadonlySet<string>, filename: string): string {
  const stem = filename.replace(/\.md$/, '');
  const m = /^(\d+)-(.+)$/.exec(stem);
  if (m?.[1] && m[2] && !usedSlugs.has(`${m[1]}-${m[2]}`)) {
    return `${m[1]}-${m[2]}`;
  }
  let max = 0;
  for (const slug of usedSlugs) {
    const mm = /^(\d+)-/.exec(slug);
    if (mm?.[1]) max = Math.max(max, Number(mm[1]));
  }
  const nameSlug = slugify(m?.[2] ?? stem);
  return `${String(max + 1).padStart(3, '0')}-${nameSlug}`;
}

/** Whether any `references/*.md` file in `referencesDir` is still
 * single-layer (an `id:` with no `slug:`) — the signal for whether the
 * pack-local `index.md` can safely be dropped yet. */
function anySingleLayerFileRemains(referencesDir: string): boolean {
  return readdirSync(referencesDir)
    .filter((f) => f.endsWith('.md'))
    .some((f) => {
      const parsed = parseCorpusDocument(readFileSync(join(referencesDir, f), 'utf8'), f);
      return parsed.id !== null && !parsed.slug;
    });
}

interface SingleLayerFile {
  filename: string;
  parsed: ParsedCorpusDocument;
}

/** Split a pack's `references/*.md` filenames into already-two-layer
 * (`slug:`, skipped) and single-layer (`id:`, to migrate) — and seed
 * `usedSlugs` with every slug already in use, the collision guard
 * `deriveMigrateSlug` needs. A document with neither id nor slug is
 * malformed — well-formedness is validate's concern, not migrate's; it's
 * simply left out of both lists. */
function classifyPackFiles(
  referencesDir: string,
  filenames: readonly string[],
  usedSlugs: Set<string>,
): { singleLayerFiles: SingleLayerFile[]; skipped: string[] } {
  const singleLayerFiles: SingleLayerFile[] = [];
  const skipped: string[] = [];
  for (const filename of filenames) {
    const parsed = parseCorpusDocument(readFileSync(join(referencesDir, filename), 'utf8'), filename);
    if (parsed.slug) {
      usedSlugs.add(parsed.slug);
      skipped.push(filename);
    } else if (parsed.id) {
      singleLayerFiles.push({ filename, parsed });
    }
  }
  return { singleLayerFiles, skipped };
}

/** Migrate one single-layer document through `registerDocument` (D-001's
 * shared backbone) and remove its old `id:` file — register-then-remove
 * ordering (D-002): the new `<slug>.md` + registry row land BEFORE the old
 * file is deleted, so an interruption mid-document leaves it re-migratable
 * rather than lost, and a completed document is simply skipped next run.
 * Returns the freshly-registered `KB-NNNN`. */
function migrateOneDocument(
  input: MigrateInput,
  referencesDir: string,
  file: SingleLayerFile,
  slug: string,
  indexById: ReadonlyMap<string, IndexEntry>,
): string {
  const { filename, parsed } = file;
  const indexRow = parsed.id ? indexById.get(parsed.id) : undefined;
  const fallbackTitle = deriveTitleAndDescription(parsed.body, slug).title;
  const title = indexRow?.title || fallbackTitle;
  const description = indexRow?.description || undefined;
  const edition = indexRow?.edition || parsed.provenance.edition;

  const { id } = registerDocument({
    knowledgeDir: input.knowledgeDir,
    marketplace: input.marketplace,
    plugin: input.pack,
    slug,
    title,
    body: parsed.body,
    origin: parsed.provenance.origin ?? TODO,
    status: parsed.provenance.status ?? TODO,
    ...(parsed.provenance.converter !== undefined ? { converter: parsed.provenance.converter } : {}),
    ...(parsed.provenance['content-hash'] !== undefined ? { contentHash: parsed.provenance['content-hash'] } : {}),
    ...(edition !== undefined ? { edition } : {}),
    ...(parsed.provenance.license !== undefined ? { license: parsed.provenance.license } : {}),
    ...(parsed.provenance['origin-url'] !== undefined ? { originUrl: parsed.provenance['origin-url'] } : {}),
    ...(description ? { description } : {}),
    ...(input.corpusMarketplaceName !== undefined ? { corpusMarketplaceName: input.corpusMarketplaceName } : {}),
  });

  // Guard against the old and new paths coinciding (the derived slug can
  // equal the current filename's own stem, e.g. `010-custom.md` -> slug
  // `010-custom`) — removing then would delete the file registerDocument
  // just wrote.
  const oldFilePath = join(referencesDir, filename);
  const newFilePath = join(referencesDir, `${slug}.md`);
  if (oldFilePath !== newFilePath) rmSync(oldFilePath, { force: true });

  return id;
}

/**
 * Convert a single-layer pack to two-layer in place (US2, FR-002/FR-003).
 */
export function migratePack(input: MigrateInput): MigrateResult {
  const packDir = join(input.knowledgeDir, input.pack);
  const referencesDir = join(packDir, REFERENCES_DIR);
  const indexPath = join(packDir, INDEX_FILE);

  if (!existsSync(referencesDir)) {
    return { pack: input.pack, migrated: [], skipped: [] };
  }

  // The pack's own (pre-migration) index — the source of a hand-corrected
  // title/description/edition that MUST survive migration (spec §2 edge
  // cases, NFR-001): keyed by the document's OLD id, since that's the only
  // identity the index still carries.
  const existingIndex = existsSync(indexPath) ? parseIndex(readFileSync(indexPath, 'utf8')) : [];
  const indexById = new Map(existingIndex.map((row) => [row.id, row]));

  const filenames = readdirSync(referencesDir)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => statSync(join(referencesDir, f)).isFile())
    .sort();

  const usedSlugs = new Set<string>();
  const { singleLayerFiles, skipped } = classifyPackFiles(referencesDir, filenames, usedSlugs);

  const migrated: string[] = [];
  for (const file of singleLayerFiles) {
    const slug = deriveMigrateSlug(usedSlugs, file.filename);
    usedSlugs.add(slug);
    migrated.push(migrateOneDocument(input, referencesDir, file, slug, indexById));
  }

  // The pack-local index.md is retired only once every document is
  // two-layer — a malformed leftover (neither id nor slug) keeps it, so the
  // pack degrades no worse than before migrate ran.
  if (!anySingleLayerFileRemains(referencesDir) && existsSync(indexPath)) {
    rmSync(indexPath, { force: true });
  }

  return { pack: input.pack, migrated, skipped };
}
