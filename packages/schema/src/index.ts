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
export { rules } from './rules/index.js';
export { extractSpecMetadata } from './extract.js';
export type { Requirement, SpecMetadata } from './extract.js';
export type {
  Finding,
  Location,
  ParsedDocument,
  PerFileRule,
  CrossFileRule,
  PerFileRuleContext,
  CrossFileRuleContext,
  Rule,
  Severity,
  ValidateOptions,
} from './types.js';
