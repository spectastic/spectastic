/**
 * The corpus index table formats — the llms.txt-spirit cheap map (051 FR-004),
 * now at two layers per the 2026-07-26-two-layer-corpus-identity amendment:
 *
 * - The pre-migration 5-column pack index (ID | Title | Description | Edition
 *   | Path) — `parseIndex`/`renderIndexTable`, UNCHANGED. Kept parsing and
 *   accepted through the `TBD-corpus-identity-migration` back-compat window;
 *   a pack that hasn't migrated still works exactly as before (NFR-001-style
 *   non-breaking landing, per the amendment's §6 scoping).
 * - The post-migration formats, additive: the project's 7-column root
 *   registry (`parseRegistry`/`renderRegistryTable`, FR-009) and a pack's
 *   `SKILL.md`-inlined slug map (`parseSkillSlugMap`, FR-004 MODIFY).
 *
 * Parse and render live together (051's `loadCorpus` reads; 056's adapter
 * writes) rather than each module inventing its own half of the format —
 * the shared-grammar-subpath pattern (mirrors `citation-shared.ts`'s split
 * between the schema package's rule and core's gate).
 */
import { KB_ID_RE, SLUG_RE, type IndexEntry, type RegistryEntry } from './types.js';

const INDEX_COLUMNS = 5;
const REGISTRY_COLUMNS = 8;
/** A pre-061 registry row has no `status` column at all — accepted alongside
 * the current 8-column shape so an unmigrated registry degrades (status
 * defaults to `''`) rather than breaking (061-corpus-ingester T-021). */
const LEGACY_REGISTRY_COLUMNS = 7;
const SLUG_MAP_COLUMNS = 5;

/** One row of a pack's `SKILL.md`-inlined slug map (FR-004 MODIFY) — the
 * portable, pack-owned half; parallel to `IndexEntry` but keyed on the
 * pack-internal slug, never a `KB-` id (a pack never mints one, FR-002). */
export interface SkillSlugMapEntry {
  slug: string;
  title: string;
  description: string;
  edition: string;
  path: string;
}

/** Split one markdown table row into its trimmed cells (`"| a | b |"` →
 * `['a', 'b']`), or null if the line isn't a table row at all. */
function tableRowCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return null;
  return trimmed
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
}

/** Parse a pack's curated index. A table over freeform link-list prose: as
 * mechanically parseable as the frontmatter itself, so a hand-edited index
 * degrades the same way a hand-edited document does — a malformed row is
 * silently skipped rather than corrupting the rest of the index, never
 * silently invented. */
export function parseIndex(raw: string): IndexEntry[] {
  const entries: IndexEntry[] = [];
  for (const line of raw.split('\n')) {
    const cells = tableRowCells(line);
    if (!cells || cells.length !== INDEX_COLUMNS) continue;
    const [id, title, description, edition, path] = cells;
    if (!id || !KB_ID_RE.test(id)) continue; // header / separator / malformed row
    entries.push({ id, title: title ?? '', description: description ?? '', edition: edition ?? '', path: path ?? '' });
  }
  return entries;
}

/** Render a set of index rows into the same 5-column table, sorted by id
 * for deterministic output (056-corpus-adapter). */
export function renderIndexTable(rows: readonly IndexEntry[]): string {
  const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));
  const header = '| ID | Title | Description | Edition | Path |\n| --- | --- | --- | --- | --- |';
  const body = sorted.map((r) => `| ${r.id} | ${r.title} | ${r.description} | ${r.edition} | ${r.path} |`).join('\n');
  return `${header}\n${body}\n`;
}

/** Parse the project's root corpus registry (FR-009, `knowledge/index.md`) —
 * an 8-column table over `KB-NNNN | Marketplace | Plugin | Slug | Title |
 * Edition | Path | Status` (the `Status` column added by 061-corpus-ingester
 * T-021, FR-007 — orphan-flagging). A pre-061, 7-column row (no `Status` at
 * all) is still accepted, defaulting `status` to `''`, so an unmigrated
 * registry degrades rather than breaks (NFR-001-style non-breaking landing).
 * Same discipline as `parseIndex` otherwise: a malformed row is silently
 * skipped, never invented; `KB_ID_RE` on column 1 doubles as the
 * header/separator exclusion. */
export function parseRegistry(raw: string): RegistryEntry[] {
  const entries: RegistryEntry[] = [];
  for (const line of raw.split('\n')) {
    const cells = tableRowCells(line);
    if (!cells || (cells.length !== REGISTRY_COLUMNS && cells.length !== LEGACY_REGISTRY_COLUMNS)) continue;
    const [id, marketplace, plugin, slug, title, edition, path, status] = cells;
    if (!id || !KB_ID_RE.test(id)) continue; // header / separator / malformed row
    entries.push({
      id,
      marketplace: marketplace ?? '',
      plugin: plugin ?? '',
      slug: slug ?? '',
      title: title ?? '',
      edition: edition ?? '',
      path: path ?? '',
      status: status === 'orphaned' ? 'orphaned' : '',
    });
  }
  return entries;
}

/** Render the root registry into the same 8-column table (T-021's `Status`
 * column added), sorted by `KB-NNNN` for deterministic output (mirrors
 * `renderIndexTable`). */
export function renderRegistryTable(rows: readonly RegistryEntry[]): string {
  const sorted = [...rows].sort((a, b) => a.id.localeCompare(b.id));
  const header =
    '| KB-NNNN | Marketplace | Plugin | Slug | Title | Edition | Path | Status |\n' +
    '| --- | --- | --- | --- | --- | --- | --- | --- |';
  const body = sorted
    .map(
      (r) =>
        `| ${r.id} | ${r.marketplace} | ${r.plugin} | ${r.slug} | ${r.title} | ${r.edition} | ${r.path} | ${r.status ?? ''} |`,
    )
    .join('\n');
  return `${header}\n${body}\n`;
}

/** Parse a pack's `SKILL.md`-inlined slug map (FR-004 MODIFY) — the same
 * 5-column shape `parseIndex` reads, keyed on the pack-internal `SLUG_RE`
 * shape instead of `KB_ID_RE`, so it finds the map table wherever it sits
 * inside `SKILL.md`'s surrounding frontmatter and prose without mistaking
 * unrelated content for a row (the slug shape excludes the table's own
 * header/separator rows, the same way `KB_ID_RE` does for `parseIndex`). */
export function parseSkillSlugMap(raw: string): SkillSlugMapEntry[] {
  const entries: SkillSlugMapEntry[] = [];
  for (const line of raw.split('\n')) {
    const cells = tableRowCells(line);
    if (!cells || cells.length !== SLUG_MAP_COLUMNS) continue;
    const [slug, title, description, edition, path] = cells;
    if (!slug || !SLUG_RE.test(slug)) continue; // header / separator / malformed row
    entries.push({
      slug,
      title: title ?? '',
      description: description ?? '',
      edition: edition ?? '',
      path: path ?? '',
    });
  }
  return entries;
}

/** Render a pack's slug map into the same 5-column table, sorted by slug for
 * deterministic output (mirrors `renderIndexTable`). */
export function renderSkillSlugMapTable(rows: readonly SkillSlugMapEntry[]): string {
  const sorted = [...rows].sort((a, b) => a.slug.localeCompare(b.slug));
  const header = '| Slug | Title | Description | Edition | Path |\n| --- | --- | --- | --- | --- |';
  const body = sorted
    .map((r) => `| ${r.slug} | ${r.title} | ${r.description} | ${r.edition} | ${r.path} |`)
    .join('\n');
  return `${header}\n${body}\n`;
}
