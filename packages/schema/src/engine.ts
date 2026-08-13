import { parse } from './parser.js';
import { rules } from './rules/index.js';
import type { Finding, ParsedDocument, ValidateOptions } from './types.js';

/**
 * Validate a single spec-html document. Returns every finding from every
 * rule in the registry. Cross-file rules treat the single doc as a
 * one-element set — so a duplicate id within the same file still fires
 * `no-duplicate-ids`.
 */
export function validate(html: string, options: ValidateOptions = {}): Finding[] {
  const doc = parse(html, options.file ?? '<anonymous>');
  const findings: Finding[] = [];
  for (const rule of rules) {
    if (rule.scope === 'per-file') findings.push(...rule.check({ doc }));
    else findings.push(...rule.check({ docs: [doc] }));
  }
  return findings;
}

/**
 * Validate a set of documents together. Runs every per-file rule against
 * every document, then runs every cross-file rule once against the
 * aggregate. Used by the CLI to power glob expansion + the
 * `no-duplicate-ids` cross-file check.
 */
export function validateMany(inputs: readonly { html: string; file: string }[]): Finding[] {
  return validateDocs(inputs.map((i) => parse(i.html, i.file)));
}

/**
 * Validate documents that have already been parsed.
 *
 * The same work as `validateMany` without the parse, for a caller that holds
 * the documents already. That caller is the CLI: a validate run also executes
 * a dozen filesystem-facing scans over the same files, and before this existed
 * each of them re-parsed independently — 1489 parses for 379 files, 24.1MB of
 * parsing over a 10.7MB corpus.
 *
 * Safe to share a document between callers because nothing here writes to one:
 * every rule reads `tagName`, `attrs`, `childNodes` and location, and
 * accumulates into its own arrays.
 */
export function validateDocs(docs: readonly ParsedDocument[]): Finding[] {
  const findings: Finding[] = [];
  for (const doc of docs) {
    for (const rule of rules) {
      if (rule.scope !== 'per-file') continue;
      findings.push(...rule.check({ doc }));
    }
  }
  for (const rule of rules) {
    if (rule.scope !== 'cross-file') continue;
    findings.push(...rule.check({ docs }));
  }
  return findings;
}
