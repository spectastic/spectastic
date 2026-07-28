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
export {
  parseCorpusDocument,
  corpusWellFormedFindings,
  corpusRegistryFindings,
  corpusLicenseFindings,
  isPermissiveLicense,
  fenceCorpusDocument,
  resolveCitation,
  renderCitationLabel,
  corpusGroundingFindings,
  allocateRegistryIds,
  installPack,
  mergeRegistryRows,
  parseCoordinate,
  registerDocument,
  NOT_YET_SPOT_CHECKED_STATUS,
  NOT_CITABLE_UNTIL_SIGNED_OFF_STATUS,
  NOT_CITABLE_UNTIL_CONFIRMED_STATUS,
  buildCorpusPromptBlock,
  CORPUS_HINT,
  withCorpusHint,
  parseIndex,
  renderIndexTable,
  parseRegistry,
  renderRegistryTable,
  parseSkillSlugMap,
  renderSkillSlugMapTable,
  adaptCorpus,
  allocateIds,
  contentHashOf,
  deriveProvenance,
  fileConvertedDocument,
  CONVERTERS,
  resolveConverterSpec,
  ExecFileConverterRunner,
  StubConverterRunner,
  createConverterTmpDir,
  removeConverterTmpDir,
  DEFAULT_TIMEOUT_MS,
  convertDocument,
  ConverterNotFoundError,
  renderMarketplaceManifest,
  syncMarketplaceManifest,
  publishCorpus,
  packAgnosticismFindings,
  resolveMarketplacePacks,
  KB_ID_RE,
  REQUIRED_PROVENANCE_FIELDS,
  loadCorpus,
  loadRegistry,
} from './knowledge/index.js';
export type {
  InstallInput,
  InstallResult,
  RegisterDocumentInput,
  SkillSlugMapEntry,
  AdaptInput,
  AdaptResult,
  FileConvertedDocumentInput,
  FileConvertedDocumentResult,
  ConverterRunner,
  ConverterSpec,
  ConvertDocumentInput,
  ConvertDocumentResult,
  MarketplaceManifest,
  MarketplacePluginEntry,
  RenderMarketplaceManifestInput,
  SyncMarketplaceManifestInput,
  PublishCorpusInput,
  PublishCorpusResult,
  CorpusDocument,
  CorpusPack,
  IndexEntry,
  ParsedCorpusDocument,
  Provenance,
  RegistryEntry,
  ResolvedCitation,
  SupersededEdition,
} from './knowledge/index.js';

export { RealPackFetcher, PackFetcherError } from './providers/pack-fetcher.js';
export type { GitRunner, GitSource, PackFetcher } from './providers/pack-fetcher.js';
export { StubPackFetcher, StubPackFetcherError } from './providers/pack-fetcher-stub.js';

export {
  loadCorpusConfig,
  resolveCorpusConfig,
  defaultMarketplaceName,
  DEFAULT_CORPUS_ROOT,
  CorpusConfigError,
} from './config.js';
export type { CorpusFileConfig, ResolvedCorpusConfig } from './config.js';

export { createPackFetcher } from './pack-fetcher-factory.js';
export type { CreatePackFetcherOptions } from './pack-fetcher-factory.js';
