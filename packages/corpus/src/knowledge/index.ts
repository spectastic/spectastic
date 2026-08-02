/**
 * Pack/index loader (051-knowledge-corpus, T-013).
 *
 * `loadCorpus()` walks `knowledge/<pack>/` directories and assembles each
 * into a `CorpusPack` — SKILL.md presence, the curated index, and every
 * `references/` document (parsed via `parseCorpusDocument`, never crashing
 * on a malformed one). Returns an empty array when no `knowledge/`
 * directory exists at all — the graceful-absence no-op (plan D-005,
 * NFR-001): every verb that consumes this stays unchanged with no corpus
 * present.
 *
 * No vector index, no database — a flat directory walk (FR-008); "the
 * codebase is the index" (§4 of the considerations doc).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseIndex, parseRegistry } from './index-format.js';
import { parseCorpusDocument } from './parse.js';
import type { CorpusDocument, CorpusPack, RegistryEntry, SupersededEdition } from './types.js';

export type { AdaptInput, AdaptResult } from './adapt.js';
export {
  adaptCorpus,
  allocateIds,
  contentHashOf,
  deriveProvenance,
} from './adapt.js';
export type {
  ConvertDocumentInput,
  ConvertDocumentResult,
  ConverterRunner,
  ConverterSpec,
} from './convert.js';
export {
  CONVERTERS,
  ConverterNotFoundError,
  convertDocument,
  createConverterTmpDir,
  DEFAULT_TIMEOUT_MS,
  ExecFileConverterRunner,
  removeConverterTmpDir,
  resolveConverterSpec,
  StubConverterRunner,
} from './convert.js';
export { fenceCorpusDocument } from './fence.js';
export { corpusGroundingFindings } from './gates.js';
export type { SkillSlugMapEntry } from './index-format.js';
export {
  parseIndex,
  parseRegistry,
  parseSkillSlugMap,
  renderIndexTable,
  renderRegistryTable,
  renderSkillSlugMapTable,
} from './index-format.js';
export type {
  InstallInput,
  InstallResult,
  RegisterDocumentInput,
} from './ingest.js';
export {
  allocateRegistryIds,
  installPack,
  mergeRegistryRows,
  NOT_CITABLE_UNTIL_CONFIRMED_STATUS,
  NOT_CITABLE_UNTIL_SIGNED_OFF_STATUS,
  NOT_YET_SPOT_CHECKED_STATUS,
  parseCoordinate,
  registerDocument,
} from './ingest.js';
export { corpusLicenseFindings, isPermissiveLicense } from './license.js';
export type { MigrateInput, MigrateResult } from './migrate.js';
export {
  isSingleLayerPack,
  migratePack,
  singleLayerDocuments,
} from './migrate.js';
export {
  packAgnosticismFindings,
  resolveMarketplacePacks,
} from './pack-agnostic.js';
// This file is the package's single `./knowledge` tsup entry (plan D-001) —
// parse.ts, validate.ts, fence.ts, resolve.ts, gates.ts and types.ts are not
// separately bundled, so anything a consumer (the CLI's scanCorpusWellFormed
// / scanCorpusGrounding, or 054–059) needs is re-exported from here.
export { parseCorpusDocument } from './parse.js';
export {
  buildCorpusPromptBlock,
  CORPUS_HINT,
  withCorpusHint,
} from './prompt.js';
export type {
  MarketplaceManifest,
  MarketplacePluginEntry,
  PublishCorpusInput,
  PublishCorpusResult,
  RenderMarketplaceManifestInput,
  SyncMarketplaceManifestInput,
} from './publish.js';
export {
  publishCorpus,
  renderMarketplaceManifest,
  syncMarketplaceManifest,
} from './publish.js';
export { registryEntryUri, renderCitationLabel, resolveCitation, resolveCorpusCoordinate } from './resolve.js';
export type {
  CorpusDocument,
  CorpusPack,
  IndexEntry,
  ParsedCorpusDocument,
  Provenance,
  RegistryEntry,
  ResolvedCitation,
  SupersededEdition,
} from './types.js';
export { KB_ID_RE, REQUIRED_PROVENANCE_FIELDS } from './types.js';
export {
  corpusRegistryFindings,
  corpusWellFormedFindings,
} from './validate.js';

const KNOWLEDGE_DIR = 'knowledge';
const SKILL_FILE = 'SKILL.md';
const INDEX_FILE = 'index.md';
const REFERENCES_DIR = 'references';
const REGISTRY_PATH = join(KNOWLEDGE_DIR, 'index.md');

/** Every `references/*.md` document in a pack, parsed best-effort — a
 * malformed document is still included (with `missingFields` populated),
 * never dropped or crashed on. */
function loadDocuments(packDir: string, baseDir: string): CorpusDocument[] {
  const referencesDir = join(packDir, REFERENCES_DIR);
  if (!existsSync(referencesDir)) return [];
  const documents: CorpusDocument[] = [];
  for (const entry of readdirSync(referencesDir).sort()) {
    if (!entry.endsWith('.md')) continue;
    const filePath = join(referencesDir, entry);
    if (!statSync(filePath).isFile()) continue;
    const raw = readFileSync(filePath, 'utf8');
    const relPath = relative(baseDir, filePath);
    documents.push({ ...parseCorpusDocument(raw, relPath), filePath: relPath });
  }
  return documents;
}

/** Retained prior editions under `references/superseded/` (052 FR-003).
 * Walks that subdirectory (which `loadDocuments` deliberately skips, being
 * non-recursive) and parses each into a `SupersededEdition` — id + edition
 * from its frontmatter, kept separate from `documents[]` so the duplicate-id
 * check never fires on a legitimate current + prior pair. A superseded file
 * with no id or edition is dropped (it can't be pinned-cited). */
function loadSuperseded(packDir: string, baseDir: string): SupersededEdition[] {
  const supersededDir = join(packDir, REFERENCES_DIR, 'superseded');
  if (!existsSync(supersededDir)) return [];
  const editions: SupersededEdition[] = [];
  for (const entry of readdirSync(supersededDir).sort()) {
    if (!entry.endsWith('.md')) continue;
    const filePath = join(supersededDir, entry);
    if (!statSync(filePath).isFile()) continue;
    const parsed = parseCorpusDocument(readFileSync(filePath, 'utf8'), relative(baseDir, filePath));
    const edition = parsed.provenance.edition;
    if (parsed.id === null || edition === undefined) continue;
    editions.push({
      id: parsed.id,
      edition,
      filePath: relative(baseDir, filePath),
      provenance: parsed.provenance,
    });
  }
  return editions;
}

/** Load every `knowledge/<pack>/` directory into a `CorpusPack`. Returns an
 * empty array when `knowledge/` doesn't exist — the graceful-absence
 * contract every downstream verb (052–059, and the folded validate scan,
 * T-110) relies on to behave exactly as today with no corpus present. */
export function loadCorpus(cwd: string): CorpusPack[] {
  const knowledgeDir = join(cwd, KNOWLEDGE_DIR);
  if (!existsSync(knowledgeDir)) return [];

  const packs: CorpusPack[] = [];
  for (const name of readdirSync(knowledgeDir).sort()) {
    const dirPath = join(knowledgeDir, name);
    if (!statSync(dirPath).isDirectory()) continue;

    const hasSkillFile = existsSync(join(dirPath, SKILL_FILE));
    const indexPath = join(dirPath, INDEX_FILE);
    const index = existsSync(indexPath) ? parseIndex(readFileSync(indexPath, 'utf8')) : [];
    // Paths are stored relative to the corpus root (`knowledgeDir`), not the
    // repo root — so the configured base can be overridden without rewriting a
    // single stored path (062 triage T-002), and a registry hit's filePath
    // (also corpus-root-relative, written by the ingester) matches a pack-scan
    // hit's, keeping resolveCitation's filePath base consistent across routes.
    const documents = loadDocuments(dirPath, knowledgeDir);
    const supersededEditions = loadSuperseded(dirPath, knowledgeDir);

    packs.push({
      name,
      dirPath: relative(knowledgeDir, dirPath),
      hasSkillFile,
      index,
      documents,
      supersededEditions,
    });
  }
  return packs;
}

/** Load the project's root corpus registry (FR-009, `knowledge/index.md`) —
 * the two-layer model's repo-unique half (2026-07-26-hybrid-corpus-citation,
 * T-1001). Returns an empty array when the file doesn't exist yet — a
 * project mid-migration, or one that hasn't imported anything, owes no
 * registry (051 FR-009's own graceful-absence framing) and every consumer
 * (the grounding gate here, the eventual `TBD-corpus-root-index-ingester`)
 * falls back to the pack scan exactly as before this row existed. */
export function loadRegistry(cwd: string): RegistryEntry[] {
  const registryPath = join(cwd, REGISTRY_PATH);
  if (!existsSync(registryPath)) return [];
  return parseRegistry(readFileSync(registryPath, 'utf8'));
}
