import { findAll, getAttr, getLocation, walk } from '../parser.js';
import type { CrossFileRule, Finding, Location } from '../types.js';

/**
 * Cross-file duplicate detection for spectastic's project-wide stable IDs.
 *
 * Per P-3 of the principles: "Every requirement and decision has a
 * stable, human-meaningful ID (REQ-FORMAT-001, D-001). IDs are anchors,
 * anchors are review comments, anchors are how LLMs target edits."
 *
 * Spectastic uses two ID conventions side by side:
 *
 *   - **Project-wide qualified** — three dash-separated segments,
 *     e.g. `REQ-FORMAT-001`, `REQ-CHANGE-005`, `REQ-AUTH-001`. The
 *     topic prefix means the ID is intended to be unique across every
 *     artifact in the project. These ARE forever contracts under P-3.
 *
 *   - **Spec-local** — two segments, e.g. `FR-001`, `NFR-001`,
 *     `SC-001`, `D-001`, `T-001`. By project convention, every spec
 *     numbers its own functional requirements, non-functional
 *     requirements, success criteria, decisions, and tasks
 *     independently. These IDs are stable within their own file
 *     but expected to repeat across files.
 *
 * This rule scopes its check to BOTH conditions: the element must be a
 * `<spec-requirement>` or `<spec-decision>`, AND the id= must match
 * the project-wide qualified pattern (3+ dash-separated segments). The
 * CLI additionally ignores `**\/archive\/**` and `**\/withdrawn\/**`
 * so archived proposals don't spuriously collide with the live spec.
 *
 * Implements FR-011 of specs/002-validate-cli/spec.html.
 */
const SCOPED_TAGS: ReadonlySet<string> = new Set(['spec-requirement', 'spec-decision']);
const PROJECT_WIDE_ID = /^[A-Z]+(-[A-Z]+)+-[0-9]+$/;

export const noDuplicateIdsRule: CrossFileRule = {
  id: 'no-duplicate-ids',
  scope: 'cross-file',
  defaultSeverity: 'error',
  description:
    'Project-wide stable IDs on <spec-requirement> and <spec-decision> must be unique across every artifact.',
  check({ docs }) {
    const sites = new Map<string, Location[]>();
    for (const doc of docs) {
      // An ID inside a <spec-delta> is a proposal's POST-STATE — the requirement as it
      // will read once applied — not a second definition competing with the live one.
      // Without this, any in-flight proposal modifying a project-wide ID fails validate
      // until it is applied and archived, which is the one window a proposal exists in.
      // Archived and withdrawn proposals are excluded upstream at the CLI glob; this is
      // the same exemption for the live folder, and it is narrower than a path exclusion
      // because the delta's own shape rules still run.
      const inDelta = new Set<unknown>();
      for (const delta of findAll(doc.ast, 'spec-delta')) walk(delta, (el) => inDelta.add(el));
      walk(doc.ast, (el) => {
        if (inDelta.has(el)) return;
        if (!SCOPED_TAGS.has(el.tagName)) return;
        const id = getAttr(el, 'id');
        if (!id || !PROJECT_WIDE_ID.test(id)) return;
        const loc = getLocation(el);
        const list = sites.get(id) ?? [];
        list.push({ file: doc.file, line: loc.line, column: loc.column });
        sites.set(id, list);
      });
    }
    const findings: Finding[] = [];
    for (const [id, locations] of sites) {
      if (locations.length < 2) continue;
      for (let i = 0; i < locations.length; i++) {
        const here = locations[i];
        if (!here) continue;
        const related = locations.filter((_, j) => j !== i);
        findings.push({
          file: here.file,
          line: here.line,
          column: here.column,
          rule: 'no-duplicate-ids',
          severity: 'error',
          message: `duplicate stable ID "${id}" — IDs are forever-contracts per P-3 and must be unique across the project`,
          fixHint: 'Either give the duplicate a new ID, or remove it. Stable IDs are never reused.',
          relatedLocations: related,
        });
      }
    }
    return findings;
  },
};
