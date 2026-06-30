import { findAll, getAttr, getLocation } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';

const ATTRS = ['reach', 'impact', 'confidence', 'effort'] as const;

/**
 * A `<spec-rice>` block must declare numeric `reach`, `impact`, `confidence`,
 * and `effort`, all non-negative, with `effort > 0` (it is the divisor of the
 * RICE value). A malformed block would otherwise read as *unranked* silently
 * (spec 028-dependency-ordering, FR-003 / FR-006) — this rule makes the gap
 * loud so the value score isn't quietly dropped.
 */
export const riceWellFormedRule: PerFileRule = {
  id: 'rice-well-formed',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    '<spec-rice> must declare numeric reach/impact/confidence/effort (all ≥ 0, effort > 0).',
  check({ doc }) {
    const findings: Finding[] = [];
    for (const el of findAll(doc.ast, 'spec-rice')) {
      const loc = getLocation(el);
      for (const attr of ATTRS) {
        const raw = getAttr(el, attr);
        if (raw === undefined) {
          findings.push({
            file: doc.file,
            line: loc.line,
            column: loc.column,
            rule: 'rice-well-formed',
            severity: 'error',
            message: `<spec-rice> missing required ${attr}= attribute`,
            fixHint: 'Declare reach, impact, confidence and effort, e.g. <spec-rice reach="3" impact="2" confidence="0.8" effort="2">.',
          });
          continue;
        }
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          findings.push({
            file: doc.file,
            line: loc.line,
            column: loc.column,
            rule: 'rice-well-formed',
            severity: 'error',
            message: `<spec-rice> ${attr}="${raw}" is not a non-negative number`,
            fixHint: `Set ${attr}= to a non-negative number.`,
          });
        } else if (attr === 'effort' && n === 0) {
          findings.push({
            file: doc.file,
            line: loc.line,
            column: loc.column,
            rule: 'rice-well-formed',
            severity: 'error',
            message: '<spec-rice> effort="0" would divide by zero',
            fixHint: 'Set effort to a positive number (it is the RICE divisor).',
          });
        }
      }
    }
    return findings;
  },
};
