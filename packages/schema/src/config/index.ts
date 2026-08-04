/**
 * The canonical configuration surface (spec 086).
 *
 * One import for everything that reads `spectastic.json` — the declared
 * registry, and the resolver that applies it to a project. Nothing else in the
 * repository should parse that file.
 */

export {
  CONFIG_REGISTRY,
  NO_DEFAULT,
  declaredKeys,
  describeKey,
  hasDefault,
  sectionNames,
  type ConfigRegistry,
  type KeyDescriptor,
  type KeyType,
  type SectionDescriptor,
  type SectionName,
} from './registry.js';

export {
  configValue,
  loadConfig,
  readConfigFile,
  resolveConfig,
  type Origin,
  type ResolvedSection,
  type ResolvedValue,
} from './resolve.js';
