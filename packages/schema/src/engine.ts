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
  const docs: ParsedDocument[] = inputs.map((i) => parse(i.html, i.file));
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

