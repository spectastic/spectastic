import { classifyProjectId, parseResourceUri } from '../project-shared.js';
import type { Element } from '../parser.js';
import { findAll, getAttr, getLocation } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';

/**
 * `resource-scope-well-formed` (spec 119-decision-resource-scope, FR-002/FR-005,
 * NFR-002). A decision may govern a data store with a `<spec-resource>` scope —
 * a `coordinate` (the store), an `owner` (the project that may write it), and an
 * optional `allowed-in`. This rule validates the shape of that declaration so an
 * author is told at commit/CI, before the owner-aware verdict rests on it:
 *
 *  - the `coordinate` is a well-formed `datastore` resource URI;
 *  - the `owner` is a well-formed project identity;
 *  - the `owner` agrees with the coordinate's own authority — a coordinate cannot
 *    name one owner and the attribute another.
 *
 * Validation goes through the single 067 grammar (`parseResourceUri`,
 * `classifyProjectId`), never a second parser (NFR-002), so a coordinate this
 * rule accepts and one the identity engine accepts can never disagree.
 *
 * Pure: parser + the shared identity grammar only. No fs, no clock, no network.
 */
export const resourceScopeWellFormedRule: PerFileRule = {
  id: 'resource-scope-well-formed',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    'A <spec-resource> scope must carry a well-formed datastore coordinate, a well-formed project-identity owner, and an owner that agrees with the coordinate authority.',
  check({ doc }) {
    const findings: Finding[] = [];
    const decisions = findAll(doc.ast, 'spec-decision');
    if (decisions.length === 0) return findings; // absence is never a finding

    const flag = (el: Element, message: string, fixHint: string): void => {
      const loc = getLocation(el);
      findings.push({ file: doc.file, line: loc.line, column: loc.column, rule: 'resource-scope-well-formed', severity: 'error', message, fixHint });
    };

    for (const d of decisions) {
      const id = getAttr(d, 'id') ?? '?';
      for (const res of findAll(d, 'spec-resource')) {
        const coordinate = getAttr(res, 'coordinate') ?? '';
        const owner = getAttr(res, 'owner') ?? '';

        const parsed = parseResourceUri(coordinate);
        // 1. The coordinate must be a well-formed datastore URI.
        if (!parsed.ok) {
          flag(
            res,
            `<spec-resource> in <spec-decision id="${id}"> has a malformed coordinate="${coordinate}" — ${parsed.reason}`,
            'Use a datastore coordinate, e.g. spectastic://<owner>/<project>/datastore/<name>.',
          );
        } else if (parsed.value.kind !== 'datastore') {
          flag(
            res,
            `<spec-resource> in <spec-decision id="${id}"> coordinate is a "${parsed.value.kind}", not a datastore`,
            'A resource scope governs a data store — the coordinate kind must be datastore.',
          );
        }

        // 2. The owner must be a well-formed project identity.
        const ownerShape = classifyProjectId(owner);
        if (ownerShape === 'malformed') {
          flag(
            res,
            `<spec-resource> in <spec-decision id="${id}"> has an owner="${owner}" that is not a well-formed project identity`,
            'The owner is an owner-qualified project identity, e.g. acme/positions-service.',
          );
        } else if (parsed.ok && parsed.value.project !== owner) {
          // 3. A valid owner that disagrees with the coordinate's own authority.
          flag(
            res,
            `<spec-resource> in <spec-decision id="${id}"> owner="${owner}" disagrees with the coordinate authority "${parsed.value.project}"`,
            'The owner attribute and the coordinate authority must name the same project.',
          );
        }
      }
    }
    return findings;
  },
};
