/**
 * @spectastic/schema — public surface.
 *
 * The TypeScript module form of the spec-html grammar. Consumed by
 * @spectastic/cli, the future VS Code extension, the MCP server, and
 * any kernel that needs to judge spec validity.
 *
 * Per FR-013 of specs/002-validate-cli/spec.html: this entry exports
 * the validate function, the types consumers need to model findings,
 * and the rule registry. Nothing else.
 */

export { validate, validateMany } from './engine.js';
export type {
  ArtifactHealth,
  BudgetBand,
  Requirement,
  RiceInputs,
  SpecMetadata,
} from './extract.js';
export {
  extractHealth,
  extractRice,
  extractSpecMetadata,
  extractSpecStatus,
  riceValue,
} from './extract.js';
export { rules } from './rules/index.js';
export type {
  CrossFileRule,
  CrossFileRuleContext,
  Finding,
  Location,
  ParsedDocument,
  PerFileRule,
  PerFileRuleContext,
  Rule,
  Severity,
  ValidateOptions,
} from './types.js';
