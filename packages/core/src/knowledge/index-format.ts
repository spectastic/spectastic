/**
 * The corpus index table format — a 5-column markdown table (ID | Title |
 * Description | Edition | Path), the llms.txt-spirit cheap map (051 FR-004).
 *
 * Parse and render live together (051's `loadCorpus` reads; 056's adapter
 * writes) rather than each module inventing its own half of the format —
 * the shared-grammar-subpath pattern (mirrors `citation-shared.ts`'s split
 * between the schema package's rule and core's gate).
 */
import { KB_ID_RE, type IndexEntry } from './types.js';

const INDEX_COLUMNS = 5;

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
