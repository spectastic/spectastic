/**
 * Corpus data model (051-knowledge-corpus, plan D-001, spec §4).
 *
 * This is the frozen contract 052–059 all read — a corpus pack's parsed
 * shape, the provenance a citation grounds against, and the curated index
 * that gives an agent a cheap map before it reads anything (FR-004). Kept
 * minimal — only the fields the landed FRs/SCs actually need (plan §8 R1:
 * the contract is expensive to widen later, cheap to widen now).
 */

/** Provenance frontmatter fields (FR-003). All optional at the type level —
 * a document with a gap is still loaded; well-formedness is a validate
 * concern (T-110's corpusWellFormedFindings), never a parse-time crash. */
export interface Provenance {
  origin?: string;
  'origin-url'?: string;
  edition?: string;
  license?: string;
  converter?: string;
  'content-hash'?: string;
  status?: string;
}

/** The required provenance field names, in report order. `id` is checked
 * alongside these even though it lives on ParsedCorpusDocument rather than
 * Provenance — both are "the document failed to declare something
 * load-bearing" from the well-formedness scan's point of view. */
export const REQUIRED_PROVENANCE_FIELDS = [
  'origin',
  'origin-url',
  'edition',
  'license',
  'converter',
  'content-hash',
  'status',
] as const;

/** The KB-NNN id shape (FR-002) — stable, independent of file path. Matches
 * both the pre-migration pack-minted id and the post-migration project-
 * assigned `KB-NNNN` (a 4-digit baseline is still `\d{3,}`), so this constant
 * is not duplicated for the new layer. */
export const KB_ID_RE = /^KB-\d{3,}$/;

/** The pack-internal slug shape (FR-002 layer 1) — a zero-padded ordinal
 * prefix and a kebab-case name (e.g. `001-settlement-windows`), the
 * convention every migration example in the 2026-07-26-two-layer-corpus-
 * identity amendment and the considerations doc uses. FR-002 doesn't mandate
 * a stricter shape than "short, path-independent, pack-unique"; this is the
 * accepted parsing convention, shared by the frontmatter parser (`parse.ts`)
 * and the `SKILL.md`-inlined map parser (`index-format.ts`) so the two agree
 * on what a slug looks like, the same role `KB_ID_RE` plays for both
 * `parseCorpusDocument` and `parseIndex`/`parseRegistry`. */
export const SLUG_RE = /^\d+-[a-z0-9]+(?:-[a-z0-9]+)*$/i;

/** Best-effort parse result for one `references/` document (FR-003). Never
 * throws; a malformed or absent field surfaces in `missingFields` rather
 * than crashing the loader on untrusted third-party content (P-11). */
export interface ParsedCorpusDocument {
  /** The KB-NNN id, or null if absent/malformed. Pre-migration meaning:
   * pack-minted, per-pack-unique. Retained through the
   * `TBD-corpus-identity-migration` back-compat window (051 amendment
   * 2026-07-26-two-layer-corpus-identity §6) — a pack that hasn't migrated
   * yet still parses via this field; `slug` (below) is the two-layer
   * replacement a migrated pack populates instead. */
  id: string | null;
  /** The pack-internal slug (FR-002 layer 1) — a short, path-independent id
   * unique only within its own pack (e.g. `001-settlement-windows`), authored
   * and owned by the pack with no knowledge of a consuming repo. Optional —
   * absent (not merely null) for a pack that hasn't migrated onto the
   * two-layer model yet, so `parseCorpusDocument`'s existing object-literal
   * return (and every pre-migration test fixture) needs no edit for this
   * addition to land (NFR-001, the same non-breaking treatment
   * `CorpusPack.supersededEditions?` already established below). `null`
   * (once populated) means a migrated pack's document has no slug
   * convention. Distinct from `id`: a pack never mints the project's
   * `KB-NNNN` (FR-009) — only a consuming project's root registry does, and
   * only a `RegistryEntry` row (below) carries one. */
  slug?: string | null;
  /** Whether a `---`-fenced frontmatter block was found at all. */
  hasFrontmatter: boolean;
  /** Required field names ('id' plus REQUIRED_PROVENANCE_FIELDS) that are
   * absent or empty. Empty array means fully well-formed. */
  missingFields: string[];
  /** Whatever provenance fields were present and parseable. */
  provenance: Provenance;
  /** The document body — everything after the frontmatter fence (or the
   * whole file, when no fence was found). */
  body: string;
}

/** A loaded `references/` document inside a CorpusPack (spec §4 — "a
 * KB-NNN ID, body text, and provenance frontmatter"). Distinct from
 * ParsedCorpusDocument: this is what the loader (T-013) assembles per
 * pack, with `filePath` for the well-formedness scan's location reports. */
export interface CorpusDocument extends ParsedCorpusDocument {
  /** Path to the source file, relative to the project root. */
  filePath: string;
}

/** One row of a pack's curated index (FR-004, the llms.txt-spirit map). */
export interface IndexEntry {
  id: string;
  title: string;
  description: string;
  edition: string;
  path: string;
}

/**
 * One row of the project's root corpus registry (FR-009, `knowledge/index.md`)
 * — the two-layer model's project-owned half. Parallel to `IndexEntry` above,
 * which is the pre-migration per-pack map; this is the post-migration
 * project-wide one. Maps an opaque, repo-unique `id` (`KB-NNNN`, matching
 * `KB_ID_RE`) to the reference it names: which marketplace and plugin (pack)
 * it was imported from, the pack's own internal `slug` for that reference,
 * and the descriptive/provenance columns a citation's rendered label reads
 * (051 D-003, the hybrid citation).
 *
 * This type fixes the registry's *shape* only. *Assigning* an id and
 * *maintaining* a row across a re-import — the `(marketplace, plugin, slug)`
 * anchor, monotonic never-reused assignment, supersede-by-append, orphan
 * flagging — is the deferred ingester's contract (`TBD-corpus-root-index-
 * ingester`), not encoded here.
 */
export interface RegistryEntry {
  /** The project-assigned, opaque, repo-unique id (`KB-NNNN`). Never mined
   * from the pack or reference name (FR-002/FR-009's no-semantic-meaning
   * rule) and never reused once assigned. */
  id: string;
  /** The source marketplace name (the Claude Code marketplace.json `name`
   * this reference was imported from). */
  marketplace: string;
  /** The plugin (pack) name within that marketplace. */
  plugin: string;
  /** The pack-internal slug this row resolves to — the other half of the
   * `(marketplace, plugin, slug)` re-import anchor. Matches a document's
   * `ParsedCorpusDocument.slug` inside that pack. */
  slug: string;
  title: string;
  /** The current edition (from the referenced document's provenance) — the
   * `@edition` a citation pins (052), distinct from the marketplace plugin
   * `version` that anchors a re-import. */
  edition: string;
  /** Path to the referenced document, relative to the project root. */
  path: string;
}

/**
 * A retained prior edition of a corpus document (052-corpus-citation-contract
 * FR-003, plan D-003). Held under `references/superseded/`, never overwritten,
 * so an edition-pinned citation to an older edition always resolves. Kept in a
 * SEPARATE collection from `documents[]` (below) so 051's duplicate-id check
 * never false-fires on a legitimate current + prior pair sharing one KB id.
 * The minimal shape plan §8 R1 freezes — id + edition + a path to the full
 * text + provenance.
 */
export interface SupersededEdition {
  /** The KB id this is a prior edition of. */
  id: string;
  /** The pinned edition (from the retained document's provenance). */
  edition: string;
  /** Path to the retained full text, relative to the project root. */
  filePath: string;
  /** The retained edition's provenance frontmatter. */
  provenance: Provenance;
}

/** A single `knowledge/<pack>/` directory — an Agent Skills folder (FR-001). */
export interface CorpusPack {
  /** The pack's directory name under `knowledge/`. */
  name: string;
  /** Path to the pack directory, relative to the project root. */
  dirPath: string;
  /** Whether a SKILL.md discovery file was found. */
  hasSkillFile: boolean;
  /** The curated index rows, parsed from the pack's index document. */
  index: IndexEntry[];
  /** Every current `references/` document found in the pack. */
  documents: CorpusDocument[];
  /** Retained prior editions from `references/superseded/` (052 FR-003). Never
   * counted among `documents[]`, so the duplicate-id check stays honest.
   * Optional so 051-era `CorpusPack` literals need no migration (NFR-001) —
   * the loader always populates it (an empty array when there is no
   * `superseded/` directory), so production consumers never see `undefined`. */
  supersededEditions?: SupersededEdition[];
}

/**
 * The result of resolving a corpus citation (052 FR-003, SC-002). Names
 * whether the citation landed on the live document or a retained prior
 * edition, and where the text lives so a reviewer can open it.
 */
export interface ResolvedCitation {
  id: string;
  edition: string;
  /** `current` if it matched the live document, `superseded` if a retained prior edition. */
  kind: 'current' | 'superseded';
  filePath: string;
  provenance: Provenance;
}
