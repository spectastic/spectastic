import { findAll, getAttr, getLocation } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';
import { isBoundByCriterionContract } from './criterion-binding.js';

/**
 * Refuse a criterion with no declared actor, or one naming the tool's own
 * vocabulary instead of a person or organisation (108-success-criteria,
 * T-110, FR-002).
 *
 * The denylist is data, not a parse: 98% of the estate's existing criteria
 * fail this, and every failure names the same small, closed vocabulary —
 * "the verb", "an image", "the number captured". Checked against the FIRST
 * WORD after stripping a leading article, which is what lets "the number of
 * capture files" and "the number captured" both resolve to the same
 * offending noun without needing a full parse.
 *
 * Fails OPEN on an actor this list doesn't recognise (spec.html's own
 * complexity-tracking assumption): a missed artifact is one bad criterion, a
 * false rejection is a blocked commit.
 */
const ARTIFACT_NOUNS = new Set([
  'verb',
  'image',
  'file',
  'files',
  'number',
  'count',
  'byte',
  'bytes',
  'artifact',
  'system',
  'tool',
  'capture',
  'output',
  'result',
  'report',
  'log',
  'request',
  'response',
  'script',
  'module',
  'function',
  'process',
  'api',
  'endpoint',
  'database',
  'server',
  'test',
  'tests',
  'build',
  'pipeline',
  'component',
  'element',
  'document',
  'page',
  'check',
  'rule',
  'validator',
]);

const LEADING_ARTICLE = /^(a|an|the)\s+/i;

function isArtifactActor(actor: string): boolean {
  const stripped = actor.trim().replace(LEADING_ARTICLE, '');
  const firstWord = stripped.split(/\s+/)[0]?.toLowerCase() ?? '';
  return ARTIFACT_NOUNS.has(firstWord);
}

export const criterionActorRule: PerFileRule = {
  id: 'criterion-actor',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: '<spec-criterion> must declare actor=, and it must not name an artifact of the system.',
  check({ doc }) {
    if (!isBoundByCriterionContract(doc.file)) return [];
    const findings: Finding[] = [];
    for (const el of findAll(doc.ast, 'spec-criterion')) {
      const loc = getLocation(el);
      const actor = getAttr(el, 'actor');
      if (actor === undefined || actor.trim() === '') {
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'criterion-actor',
          severity: 'error',
          message: `<spec-criterion id="${getAttr(el, 'id') ?? '?'}"> is missing actor=`,
          fixHint: 'Name the person or organisation who is better off — actor="reviewer", not an artifact of the system.',
        });
        continue;
      }
      if (isArtifactActor(actor)) {
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'criterion-actor',
          severity: 'error',
          message: `<spec-criterion id="${getAttr(el, 'id') ?? '?'}"> names an artifact as its actor: "${actor}"`,
          fixHint: 'A criterion restating what the tool does can never fail. Name who is better off instead.',
        });
      }
    }
    return findings;
  },
};
