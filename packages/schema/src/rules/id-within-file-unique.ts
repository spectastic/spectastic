import { getAttr, getLocation, walk } from '../parser.js';
import type { Finding, Location, PerFileRule } from '../types.js';

/**
 * Within-file spec-local id uniqueness (spec 025-id-uniqueness, FR-002).
 *
 * Spec-local ids — the two-segment `FR/NFR/SC-NNN`, `D-NNN`, `T-NNN` — number
 * each spec independently, so they repeat across files by design. But within a
 * single document an id must be unique: it is the anchor reviewers cite and LLMs
 * target (P-3). A `/spectastic.spec` re-entry edit can silently give two
 * requirements the same id; this rule flags it.
 *
 * Scope is deliberately the spec-local two-segment form only. Project-wide
 * qualified ids (`REQ-TOPIC-NNN`, three-plus segments) stay with the cross-file
 * `no-duplicate-ids` rule — which already catches a within-file qualified double,
 * since two sites in one file is two sites in its set. The two rules do not
 * overlap. Mirrors `requirement-id-required`.
 */
const ID_BEARING: ReadonlySet<string> = new Set(['spec-requirement', 'spec-decision', 'spec-task']);
const SPEC_LOCAL_ID = /^[A-Z]+-[0-9]+$/;

export const idWithinFileUniqueRule: PerFileRule = {
  id: 'id-within-file-unique',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: 'A spec-local id (FR/NFR/SC/D/T) must not be declared twice within one document.',
  check({ doc }) {
    const sites = new Map<string, Location[]>();
    walk(doc.ast, (el) => {
      if (!ID_BEARING.has(el.tagName)) return;
      const id = getAttr(el, 'id');
      if (!id || !SPEC_LOCAL_ID.test(id)) return;
      const loc = getLocation(el);
      const list = sites.get(id) ?? [];
      list.push({ file: doc.file, line: loc.line, column: loc.column });
      sites.set(id, list);
    });

    const findings: Finding[] = [];
    for (const [id, locations] of sites) {
      if (locations.length < 2) continue;
      for (let i = 0; i < locations.length; i++) {
        const here = locations[i];
        if (!here) continue;
        const others = locations.filter((_, j) => j !== i);
        findings.push({
          file: here.file,
          line: here.line,
          column: here.column,
          rule: 'id-within-file-unique',
          severity: 'error',
          message: `spec-local id "${id}" is declared ${locations.length} times in this file — ids must be unique within a document`,
          fixHint: 'Give the duplicate a fresh id; stable ids are never reused (P-3).',
          relatedLocations: others,
        });
      }
    }
    return findings;
  },
};
