/**
 * @spectastic/corpus — the package barrel (064-corpus-package-extraction, FR-001).
 *
 * Re-exports the moved knowledge/ subsystem wholesale (curation, citation, provenance,
 * licensing, prompt injection) plus the pack-fetcher providers the ingester and the CLI's
 * `import` verb need. This is the single import surface every consumer uses —
 * `@spectastic/core`'s AI verbs for injection, `@spectastic/cli`'s validate scans and corpus
 * command, and the standalone `spectastic-corpus` binary (via src/cli/index.ts, a sibling
 * entry, not this one).
 */

export type {
  CorpusFileConfig,
  ProjectFileConfig,
  ResolvedCorpusConfig,
  ResolvedProjectConfig,
} from './config.js';
export {
  CorpusConfigError,
  DEFAULT_CORPUS_ROOT,
  defaultMarketplaceName,
  loadCorpusConfig,
  loadProjectConfig,
  projectIdentityFindings,
  resolveCorpusConfig,
  resolveProjectConfig,
} from './config.js';
export type {
  AdaptInput,
  AdaptResult,
  ConvertDocumentInput,
  ConvertDocumentResult,
  ConverterRunner,
  ConverterSpec,
  CorpusDocument,
  CorpusPack,
  IndexEntry,
  InstallInput,
  InstallResult,
  MarketplaceManifest,
  MarketplacePluginEntry,
  MigrateInput,
  MigrateResult,
  ParsedCorpusDocument,
  Provenance,
  PublishCorpusInput,
  PublishCorpusResult,
  RegisterDocumentInput,
  RegistryEntry,
  RenderMarketplaceManifestInput,
  ResolvedCitation,
  SkillSlugMapEntry,
  SupersededEdition,
  SyncMarketplaceManifestInput,
} from './knowledge/index.js';
export {
  adaptCorpus,
  allocateIds,
  allocateRegistryIds,
  buildCorpusPromptBlock,
  CONVERTERS,
  CORPUS_HINT,
  ConverterNotFoundError,
  contentHashOf,
  convertDocument,
  corpusGroundingFindings,
  corpusLicenseFindings,
  corpusRegistryFindings,
  corpusWellFormedFindings,
  createConverterTmpDir,
  DEFAULT_TIMEOUT_MS,
  deriveProvenance,
  ExecFileConverterRunner,
  fenceCorpusDocument,
  installPack,
  isPermissiveLicense,
  isSingleLayerPack,
  KB_ID_RE,
  loadCorpus,
  loadRegistry,
  mergeRegistryRows,
  migratePack,
  NOT_CITABLE_UNTIL_CONFIRMED_STATUS,
  NOT_CITABLE_UNTIL_SIGNED_OFF_STATUS,
  NOT_YET_SPOT_CHECKED_STATUS,
  packAgnosticismFindings,
  parseCoordinate,
  parseCorpusDocument,
  parseIndex,
  parseRegistry,
  parseSkillSlugMap,
  publishCorpus,
  REQUIRED_PROVENANCE_FIELDS,
  registerDocument,
  removeConverterTmpDir,
  renderCitationLabel,
  renderIndexTable,
  renderMarketplaceManifest,
  renderRegistryTable,
  renderSkillSlugMapTable,
  resolveCitation,
  resolveConverterSpec,
  resolveMarketplacePacks,
  StubConverterRunner,
  singleLayerDocuments,
  syncMarketplaceManifest,
  withCorpusHint,
} from './knowledge/index.js';
export type { CreatePackFetcherOptions } from './pack-fetcher-factory.js';
export { createPackFetcher } from './pack-fetcher-factory.js';
export type {
  GitRunner,
  GitSource,
  PackFetcher,
} from './providers/pack-fetcher.js';
export { PackFetcherError, RealPackFetcher } from './providers/pack-fetcher.js';
export {
  StubPackFetcher,
  StubPackFetcherError,
} from './providers/pack-fetcher-stub.js';
