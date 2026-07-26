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

/** The KB-NNN id shape (FR-002) — stable, independent of file path. */
export const KB_ID_RE = /^KB-\d{3,}$/;

/** Best-effort parse result for one `references/` document (FR-003). Never
 * throws; a malformed or absent field surfaces in `missingFields` rather
 * than crashing the loader on untrusted third-party content (P-11). */
export interface ParsedCorpusDocument {
  /** The KB-NNN id, or null if absent/malformed. */
  id: string | null;
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
