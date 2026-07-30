/**
 * The corpus adapter (056-corpus-adapter, plan D-001–D-005; re-based onto
 * the two-layer backbone by 066-corpus-single-layer-retire D-001).
 *
 * A deterministic Node generator that shapes an existing corpus shape — a
 * folder of markdown, or an `llms.txt` — into the two-layer convention
 * (051/062): a `slug:` document, a repo-unique `KB-NNNN` root-registry row,
 * and a `SKILL.md` — the same terminal state `convert` (065) and `import`
 * reach, via the same `registerDocument` backbone (066 FR-001, SC-002).
 *
 * Two foundational rules everything else builds on:
 *  - never fabricate (FR-002/D-004): a provenance field is populated only
 *    from a value genuinely read; everything else is the literal string
 *    `TODO`. A content hash is always computed from the source bytes.
 *  - idempotent + non-destructive (NFR-001/D-005): re-running never
 *    duplicates a registry row, never re-derives an already-adapted
 *    document, and never rewrites a hand-corrected (non-TODO) field.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parseRegistry } from './index-format.js';
import { registerDocument } from './ingest.js';
import { KB_ID_RE, type Provenance, type RegistryEntry } from './types.js';

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
    // Honour a supplied `content-hash` — `convert` pins the SOURCE file's bytes,
    // not the derived markdown (065 FR-004) — else compute it from `raw`.
    'content-hash': known['content-hash'] ?? contentHashOf(raw),
    status: known.status ?? TODO,
  };
}

/** The highest numeric suffix among a set of existing pack-local KB-NNN ids
 * (0 if none match — a fresh single-layer pack allocates starting at
 * KB-001). Retained for the single-layer back-compat window
 * (`TBD-corpus-single-layer-reject`) — no longer used by `adaptCorpus`
 * itself, which now allocates repo-unique ids via the two-layer registry
 * (066), but still a legitimate general-purpose utility for a caller still
 * on the pre-062 shape. */
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
 * Allocate `count` sequential, never-colliding pack-local KB-NNN ids,
 * continuing from the pack's current highest id (D-003). Zero-padded to at
 * least 3 digits, matching `KB_ID_RE`. Deterministic given a fixed
 * `existingIds` set and ordering.
 */
export function allocateIds(existingIds: readonly string[], count: number): string[] {
  const start = maxExistingIdNum(existingIds) + 1;
  return Array.from({ length: count }, (_, i) => `KB-${String(start + i).padStart(3, '0')}`);
}

const TITLE_FALLBACK_LEN = 137;

/** A URL/filename-safe slug body — mirrors `convert.ts`'s own `slugify`
 * (065); duplicated rather than shared so this spec's diff stays scoped to
 * adapt's own re-base (066-corpus-single-layer-retire). */
function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'document'
  );
}

/** Derive the pack-internal slug for a freshly-adapted file: reuse an
 * existing registry row's slug for the same pack + name (idempotent
 * re-adapt — the file is then recognised as already-registered and left
 * untouched), else allocate the next free `NNN` for the pack. Mirrors
 * `convert.ts`'s own `deriveConvertSlug`. */
function deriveAdaptSlug(registry: readonly RegistryEntry[], plugin: string, stem: string): string {
  const nameSlug = slugify(stem);
  const existing = registry.find((e) => e.plugin === plugin && e.slug.replace(/^\d+-/, '') === nameSlug);
  if (existing) return existing.slug;
  let max = 0;
  for (const e of registry) {
    if (e.plugin !== plugin) continue;
    const m = /^(\d+)-/.exec(e.slug);
    if (m?.[1]) max = Math.max(max, Number(m[1]));
  }
  return `${String(max + 1).padStart(3, '0')}-${nameSlug}`;
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

export interface AdaptInput {
  /** Path to a directory of markdown files, or to an `llms.txt` file. */
  target: string;
  /** Absolute path to the project's `knowledge/` directory (the destination root). */
  knowledgeDir: string;
  /** The pack name — the subdirectory under `knowledgeDir`. */
  pack: string;
  /** This corpus's own publish identity — the `marketplace` column every
   * newly-registered row is filed under (066 FR-001, matches `convert`). */
  marketplace: string;
  /** Kept in sync with `marketplace.json`. Optional: a caller with no corpus
   * identity configured gets no sync side effect. */
  corpusMarketplaceName?: string;
}

export interface AdaptResult {
  pack: string;
  /** `KB-NNNN` ids newly registered this run. */
  written: string[];
  /** `KB-NNNN` ids already registered for this pack + filename, left
   * untouched this run (D-005). */
  skipped: string[];
  /** Total root-registry rows for this pack after this run — the two-layer
   * replacement for the pre-066 pack-local index row count. */
  registryRows: number;
}

function readRegistry(knowledgeDir: string): RegistryEntry[] {
  const registryPath = join(knowledgeDir, 'index.md');
  return existsSync(registryPath) ? parseRegistry(readFileSync(registryPath, 'utf8')) : [];
}

/**
 * Adapt a folder of raw markdown files into the two-layer convention (US1,
 * D-002's folder-mode leg). Each `.md` file becomes one document, filed
 * through `registerDocument` (066 D-001); a file already registered for this
 * pack + name is left completely untouched (D-005).
 */
function adaptFolder(input: AdaptInput): AdaptResult {
  let registry = readRegistry(input.knowledgeDir);

  const sourceFiles = readdirSync(input.target)
    .filter((f) => f.endsWith('.md'))
    .sort();

  const written: string[] = [];
  const skipped: string[] = [];
  for (const name of sourceFiles) {
    const stem = name.replace(/\.md$/, '');
    const slug = deriveAdaptSlug(registry, input.pack, stem);
    const already = registry.find((e) => e.plugin === input.pack && e.slug === slug);
    if (already) {
      skipped.push(already.id);
      continue;
    }

    const raw = readFileSync(join(input.target, name), 'utf8');
    const { title } = deriveTitleAndDescription(raw, stem);

    const { id } = registerDocument({
      knowledgeDir: input.knowledgeDir,
      marketplace: input.marketplace,
      plugin: input.pack,
      slug,
      title,
      body: raw,
      origin: TODO,
      status: TODO,
      ...(input.corpusMarketplaceName !== undefined ? { corpusMarketplaceName: input.corpusMarketplaceName } : {}),
    });
    written.push(id);
    registry = [
      ...registry,
      {
        id,
        marketplace: input.marketplace,
        plugin: input.pack,
        slug,
        title,
        edition: TODO,
        path: `${input.pack}/references/${slug}.md`,
        status: '',
      },
    ];
  }

  return {
    pack: input.pack,
    written,
    skipped,
    registryRows: registry.filter((e) => e.plugin === input.pack).length,
  };
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
    entries.push({
      title: m[1].trim(),
      relPath: m[2].trim(),
      description: m[3]?.trim() ?? '',
    });
  }
  return entries;
}

/**
 * Adapt via an `llms.txt`'s curated entries into the two-layer convention
 * (US2, D-002's index-seed leg). Each entry's title/description seed the
 * registered document directly — never re-derived from the body — and the
 * linked file is filed through `registerDocument`. Links resolve relative to
 * the `llms.txt`'s own directory.
 */
function adaptLlmsTxt(input: AdaptInput): AdaptResult {
  const llmsDir = dirname(input.target);
  const entries = parseLlmsTxt(readFileSync(input.target, 'utf8'));

  let registry = readRegistry(input.knowledgeDir);

  const written: string[] = [];
  const skipped: string[] = [];
  for (const entry of entries) {
    const filename = basename(entry.relPath);
    const stem = filename.replace(/\.md$/, '');
    const slug = deriveAdaptSlug(registry, input.pack, stem);
    const already = registry.find((e) => e.plugin === input.pack && e.slug === slug);
    if (already) {
      skipped.push(already.id);
      continue;
    }

    const raw = readFileSync(join(llmsDir, entry.relPath), 'utf8');

    const { id } = registerDocument({
      knowledgeDir: input.knowledgeDir,
      marketplace: input.marketplace,
      plugin: input.pack,
      slug,
      title: entry.title,
      body: raw,
      origin: TODO,
      status: TODO,
      ...(entry.description ? { description: entry.description } : {}),
      ...(input.corpusMarketplaceName !== undefined ? { corpusMarketplaceName: input.corpusMarketplaceName } : {}),
    });
    written.push(id);
    registry = [
      ...registry,
      {
        id,
        marketplace: input.marketplace,
        plugin: input.pack,
        slug,
        title: entry.title,
        edition: TODO,
        path: `${input.pack}/references/${filename}`,
        status: '',
      },
    ];
  }

  return {
    pack: input.pack,
    written,
    skipped,
    registryRows: registry.filter((e) => e.plugin === input.pack).length,
  };
}

/**
 * Adapt an existing corpus shape into the two-layer convention (FR-001).
 * Routes on what `target` points at: a directory adapts every `.md` under it
 * (folder mode, US1); an `llms.txt` file seeds entries directly (index-seed
 * mode, US2).
 */
export function adaptCorpus(input: AdaptInput): AdaptResult {
  if (statSync(input.target).isDirectory()) return adaptFolder(input);
  return adaptLlmsTxt(input);
}
