/**
 * The corpus adapter (056-corpus-adapter, plan D-001–D-005).
 *
 * A deterministic Node generator that shapes an existing corpus shape — a
 * folder of markdown, or an `llms.txt` — into 051's frontmatter + index
 * convention. Reuses 051's `parseCorpusDocument`/`KB_ID_RE`/
 * `REQUIRED_PROVENANCE_FIELDS` wholesale rather than inventing a parallel
 * contract.
 *
 * Two foundational rules everything else builds on:
 *  - never fabricate (FR-002/D-004): a provenance field is populated only
 *    from a value genuinely read; everything else is the literal string
 *    `TODO`. A content hash is always computed from the source bytes.
 *  - idempotent + non-destructive (NFR-001/D-005): re-running never
 *    duplicates an id, never re-derives an already-adapted document, and
 *    never rewrites a hand-corrected (non-TODO) field back to `TODO`.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { parseCorpusDocument } from './parse.js';
import { parseIndex, renderIndexTable } from './index-format.js';
import { KB_ID_RE, type IndexEntry, type Provenance } from './types.js';

export const TODO = 'TODO';

/** Content hash, always computed from the raw source bytes (FR-002 — never
 * skipped when the source is present). */
export function contentHashOf(raw: string): string {
  return `sha256:${createHash('sha256').update(raw, 'utf8').digest('hex')}`;
}

/**
 * Derive a document's provenance block. Any field supplied in `known` (read
 * from the source itself, or an `llms.txt` entry) is used verbatim; every
 * other field is the literal `TODO` — never a guess (D-004). `content-hash`
 * is the one field never left to chance: it is always computed here.
 */
export function deriveProvenance(raw: string, known: Partial<Provenance> = {}): Required<Provenance> {
  return {
    origin: known.origin ?? TODO,
    'origin-url': known['origin-url'] ?? TODO,
    edition: known.edition ?? TODO,
    license: known.license ?? TODO,
    converter: known.converter ?? TODO,
    'content-hash': contentHashOf(raw),
    status: known.status ?? TODO,
  };
}

/** The highest numeric suffix among a set of existing KB-NNN ids (0 if none
 * match — a fresh pack allocates starting at KB-001). */
function maxExistingIdNum(existingIds: readonly string[]): number {
  let max = 0;
  for (const id of existingIds) {
    if (!KB_ID_RE.test(id)) continue;
    const num = Number(id.slice('KB-'.length));
    if (num > max) max = num;
  }
  return max;
}

/**
 * Allocate `count` sequential, never-colliding KB-NNN ids, continuing from
 * the pack's current highest id (D-003). Zero-padded to at least 3 digits,
 * matching `KB_ID_RE`. Deterministic given a fixed `existingIds` set and
 * ordering — callers allocate to files already sorted by name.
 */
export function allocateIds(existingIds: readonly string[], count: number): string[] {
  const start = maxExistingIdNum(existingIds) + 1;
  return Array.from({ length: count }, (_, i) => `KB-${String(start + i).padStart(3, '0')}`);
}

const REFERENCES_DIR = 'references';
const INDEX_FILE = 'index.md';
const TITLE_FALLBACK_LEN = 137;

/** Render one document's full file content: `---`-fenced YAML frontmatter,
 * then the untouched body. */
function renderDocument(id: string, provenance: Required<Provenance>, body: string): string {
  const yamlBlock = stringifyYaml({ id, ...provenance }).trimEnd();
  return `---\n${yamlBlock}\n---\n\n${body}\n`;
}

/** A best-effort title + description from a raw markdown body — the first
 * `# ` heading is the title (falling back to the filename stem), and the
 * first non-empty paragraph after it is the description (empty if none).
 * Exported (061-corpus-ingester, plan D-003) so the install door's
 * `ingest.ts` reuses this derivation rather than duplicating it. */
export function deriveTitleAndDescription(body: string, fallbackTitle: string): { title: string; description: string } {
  let title = fallbackTitle;
  let description = '';
  let sawTitle = false;
  for (const line of body.split('\n')) {
    const heading = /^#\s+(.+)/.exec(line);
    if (heading?.[1] && !sawTitle) {
      title = heading[1].trim();
      sawTitle = true;
      continue;
    }
    const trimmed = line.trim();
    if (sawTitle && trimmed && !trimmed.startsWith('#')) {
      description = trimmed.length > TITLE_FALLBACK_LEN ? `${trimmed.slice(0, TITLE_FALLBACK_LEN)}...` : trimmed;
      break;
    }
  }
  return { title, description };
}

/** Merge a fresh index row set into whatever the pack's index.md already had
 * (D-005): an existing row's non-empty cells win over a freshly-derived one
 * for the same id, so a hand-edited title/description/edition survives. */
function mergeIndexRows(existing: readonly IndexEntry[], fresh: readonly IndexEntry[]): IndexEntry[] {
  const byId = new Map<string, IndexEntry>();
  for (const row of fresh) byId.set(row.id, row);
  for (const row of existing) {
    const current = byId.get(row.id);
    if (!current) {
      byId.set(row.id, row);
      continue;
    }
    byId.set(row.id, {
      id: row.id,
      title: row.title || current.title,
      description: row.description || current.description,
      edition: row.edition || current.edition,
      path: row.path || current.path,
    });
  }
  return [...byId.values()];
}

export interface AdaptInput {
  /** Path to a directory of markdown files, or to an `llms.txt` file. */
  target: string;
  /** Absolute path to the project's `knowledge/` directory (the destination root). */
  knowledgeDir: string;
  /** The pack name — the subdirectory under `knowledgeDir`. */
  pack: string;
}

export interface AdaptResult {
  pack: string;
  /** KB-NNN ids newly written this run. */
  written: string[];
  /** KB-NNN ids already adapted, left untouched this run (D-005). */
  skipped: string[];
  /** Total rows in the pack's index.md after this run. */
  indexRows: number;
}

/** Every existing, already-adapted (valid id) document under a pack's
 * `references/` dir, keyed by filename — the idempotency source of truth
 * (D-005): the SOURCE is raw and never carries an id, so "already adapted"
 * is judged by what's already at the destination, not by the source. */
function existingAdaptedByFilename(referencesDir: string): Map<string, { id: string }> {
  const map = new Map<string, { id: string }>();
  if (!existsSync(referencesDir)) return map;
  for (const name of readdirSync(referencesDir).sort()) {
    if (!name.endsWith('.md')) continue;
    const filePath = join(referencesDir, name);
    if (!statSync(filePath).isFile()) continue;
    const parsed = parseCorpusDocument(readFileSync(filePath, 'utf8'), filePath);
    if (parsed.id !== null) map.set(name, { id: parsed.id });
  }
  return map;
}

/**
 * Adapt a folder of raw markdown files into 051's convention (US1, D-002's
 * folder-mode leg). Each `.md` file becomes one document; a file already
 * adapted at the destination (valid `KB-NNN` in its frontmatter) is left
 * completely untouched (D-005) — not even its body is re-copied.
 */
function adaptFolder(input: AdaptInput): AdaptResult {
  const packDir = join(input.knowledgeDir, input.pack);
  const referencesDir = join(packDir, REFERENCES_DIR);
  mkdirSync(referencesDir, { recursive: true });

  const indexPath = join(packDir, INDEX_FILE);
  const existingIndex = existsSync(indexPath) ? parseIndex(readFileSync(indexPath, 'utf8')) : [];
  const alreadyAdapted = existingAdaptedByFilename(referencesDir);

  const sourceFiles = readdirSync(input.target)
    .filter((f) => f.endsWith('.md'))
    .sort();

  const skipped: string[] = [];
  const freshRows: IndexEntry[] = [];
  const rawFiles: string[] = [];
  for (const name of sourceFiles) {
    const already = alreadyAdapted.get(name);
    if (already) skipped.push(already.id);
    else rawFiles.push(name);
  }

  const existingIds = [
    ...existingIndex.map((r) => r.id),
    ...[...alreadyAdapted.values()].map((v) => v.id),
  ];
  const newIds = allocateIds(existingIds, rawFiles.length);

  const written: string[] = [];
  rawFiles.forEach((name, i) => {
    const id = newIds[i]!;
    const raw = readFileSync(join(input.target, name), 'utf8');
    const provenance = deriveProvenance(raw);
    const { title, description } = deriveTitleAndDescription(raw, name.replace(/\.md$/, ''));
    writeFileSync(join(referencesDir, name), renderDocument(id, provenance, raw), 'utf8');
    freshRows.push({ id, title, description, edition: provenance.edition, path: `${REFERENCES_DIR}/${name}` });
    written.push(id);
  });

  const mergedRows = mergeIndexRows(existingIndex, freshRows);
  writeFileSync(indexPath, renderIndexTable(mergedRows), 'utf8');

  return { pack: input.pack, written, skipped, indexRows: mergedRows.length };
}

interface LlmsTxtEntry {
  title: string;
  /** Relative to the `llms.txt` file's own directory (D-002). */
  relPath: string;
  description: string;
}

// A curated bullet-list entry: "- [Title](relative/path.md): optional description".
// Matches the llms.txt community-shape docs/knowledge-base-considerations.html
// cites (a curated index of markdown links) — deliberately permissive (no
// header/section structure enforced), since the entries are the only part
// this adapter consumes.
const LLMS_ENTRY_RE = /^-\s*\[(.+?)\]\((.+?)\)(?::\s*(.*))?\s*$/;

/** Parse an `llms.txt`'s bullet-list entries; non-matching lines (headings,
 * blockquote summary, blank lines) are silently skipped — malformed input
 * degrades to fewer entries, never a crash (matching 051's parser stance). */
function parseLlmsTxt(raw: string): LlmsTxtEntry[] {
  const entries: LlmsTxtEntry[] = [];
  for (const line of raw.split('\n')) {
    const m = LLMS_ENTRY_RE.exec(line.trim());
    if (!m?.[1] || !m[2]) continue;
    entries.push({ title: m[1].trim(), relPath: m[2].trim(), description: m[3]?.trim() ?? '' });
  }
  return entries;
}

/**
 * Adapt via an `llms.txt`'s curated entries (US2, D-002's index-seed leg).
 * Each entry's title/description seed its index row directly — never
 * re-derived from the body — and the linked file gains frontmatter. Links
 * resolve relative to the `llms.txt`'s own directory.
 */
function adaptLlmsTxt(input: AdaptInput): AdaptResult {
  const llmsDir = dirname(input.target);
  const entries = parseLlmsTxt(readFileSync(input.target, 'utf8'));

  const packDir = join(input.knowledgeDir, input.pack);
  const referencesDir = join(packDir, REFERENCES_DIR);
  mkdirSync(referencesDir, { recursive: true });

  const indexPath = join(packDir, INDEX_FILE);
  const existingIndex = existsSync(indexPath) ? parseIndex(readFileSync(indexPath, 'utf8')) : [];
  const alreadyAdapted = existingAdaptedByFilename(referencesDir);

  const skipped: string[] = [];
  const toAdapt: LlmsTxtEntry[] = [];
  for (const entry of entries) {
    const already = alreadyAdapted.get(basename(entry.relPath));
    if (already) skipped.push(already.id);
    else toAdapt.push(entry);
  }

  const existingIds = [
    ...existingIndex.map((r) => r.id),
    ...[...alreadyAdapted.values()].map((v) => v.id),
  ];
  const newIds = allocateIds(existingIds, toAdapt.length);

  const written: string[] = [];
  const freshRows: IndexEntry[] = [];
  toAdapt.forEach((entry, i) => {
    const id = newIds[i]!;
    const filename = basename(entry.relPath);
    const raw = readFileSync(join(llmsDir, entry.relPath), 'utf8');
    const provenance = deriveProvenance(raw);
    writeFileSync(join(referencesDir, filename), renderDocument(id, provenance, raw), 'utf8');
    freshRows.push({
      id,
      title: entry.title,
      description: entry.description,
      edition: provenance.edition,
      path: `${REFERENCES_DIR}/${filename}`,
    });
    written.push(id);
  });

  const mergedRows = mergeIndexRows(existingIndex, freshRows);
  writeFileSync(indexPath, renderIndexTable(mergedRows), 'utf8');

  return { pack: input.pack, written, skipped, indexRows: mergedRows.length };
}

/**
 * Adapt an existing corpus shape into 051's convention (FR-001). Routes on
 * what `target` points at: a directory adapts every `.md` under it
 * (folder mode, US1); an `llms.txt` file seeds the index from its entries
 * (index-seed mode, US2).
 */
export function adaptCorpus(input: AdaptInput): AdaptResult {
  if (statSync(input.target).isDirectory()) return adaptFolder(input);
  return adaptLlmsTxt(input);
}
