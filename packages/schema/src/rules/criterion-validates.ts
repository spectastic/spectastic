import { findAll, getAttr, getLocation } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';
import { isBoundByCriterionContract } from './criterion-binding.js';

/**
 * Both directions of the GQM relation, in one rule (108-success-criteria,
 * T-114, FR-007, SC-002).
 *
 * A criterion with no validates= is reported (it validates nothing, so it
 * traces to no requirement). A requirement no criterion validates is
 * reported (a gap nobody agreed how to judge, which stays invisible until
 * delivery otherwise) — but ONLY once the document has adopted the contract
 * at all. Absence is never a finding, mirroring 093's coverage check: a
 * document with zero <spec-criterion> elements has not adopted this
 * contract, and treating that as "every requirement is orphaned" would fail
 * the entire pre-108 estate the day this rule ships, which is exactly the
 * estate-wide breakage FR-013's forward-only binding exists to prevent
 * elsewhere — no reason to reintroduce it here on a technicality.
 *
 * Resolved entirely within the document (design.html D-002): validates=
 * targets are requirement ids in the same spec.html, so this needs no
 * filesystem access and no cross-file scan.
 */
function parseValidates(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const criterionValidatesRule: PerFileRule = {
  id: 'criterion-validates',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: '<spec-criterion> must declare validates=, and every requirement must be validated by some criterion.',
  check({ doc }) {
    if (!isBoundByCriterionContract(doc.file)) return [];
    const findings: Finding[] = [];
    const criteria = findAll(doc.ast, 'spec-criterion');
    if (criteria.length === 0) return findings; // absence is never a finding

    const validatedIds = new Set<string>();
    for (const el of criteria) {
      const loc = getLocation(el);
      const raw = getAttr(el, 'validates');
      const targets = raw === undefined ? [] : parseValidates(raw);
      if (targets.length === 0) {
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'criterion-validates',
          severity: 'error',
          message: `<spec-criterion id="${getAttr(el, 'id') ?? '?'}"> is missing validates=`,
          fixHint: 'Name at least one requirement id this criterion validates, e.g. validates="FR-001,FR-002".',
        });
        continue;
      }
      for (const id of targets) validatedIds.add(id);
    }

    for (const req of findAll(doc.ast, 'spec-requirement')) {
      const id = getAttr(req, 'id');
      if (id === undefined || validatedIds.has(id)) continue;
      const loc = getLocation(req);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'criterion-validates',
        severity: 'error',
        message: `requirement "${id}" is validated by no criterion`,
        fixHint: 'Add this id to a <spec-criterion validates="…"> list, or explain why it needs no measured criterion.',
      });
    }
    return findings;
  },
};
