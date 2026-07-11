import { findAll, getAttr, getLocation } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';

/**
 * A `<spec-delta>` whose `target=` is of requirement-ID shape (`^[A-Z]+-`, e.g.
 * `FR-001`, `REQ-CHANGE-002`) is a *requirement delta*: for `op="added"` or
 * `op="modified"` it MUST embed the post-state as a `<spec-requirement>`. A
 * requirement-shaped target with no embedded requirement is the T-018 fabrication
 * trap — the apply kernel would otherwise synthesize a requirement from the raw
 * delta body and inject it into the live spec. This rule catches the slip at
 * authoring time, the earliest checkpoint (the apply-time gate-block is the
 * runtime backstop).
 *
 * A non-requirement-shaped target (a manifest key/path like
 * `standard/shape-of-system-principles`) is a data/content delta and correctly
 * carries no `<spec-requirement>` — it is not flagged. `op="removed"` and
 * `op="renamed"` need no embedded post-state and are exempt.
 *
 * Enforces REQ-CHANGE-002 of specs/000-spectastic/spec.html.
 */
const REQUIREMENT_SHAPED = /^[A-Z]+-/;

export const dataDeltaShapeRule: PerFileRule = {
  id: 'data-delta-shape',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    'A requirement-shaped <spec-delta target> (added|modified) must embed a <spec-requirement>.',
  check({ doc }) {
    const findings: Finding[] = [];
    for (const delta of findAll(doc.ast, 'spec-delta')) {
      const op = getAttr(delta, 'op');
      const target = getAttr(delta, 'target');
      if (op !== 'added' && op !== 'modified') continue;
      if (!target || !REQUIREMENT_SHAPED.test(target)) continue;
      if (findAll(delta, 'spec-requirement').length > 0) continue;
      const loc = getLocation(delta);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'data-delta-shape',
        severity: 'error',
        message: `<spec-delta op="${op}" target="${target}"> names a requirement but embeds no <spec-requirement>`,
        fixHint:
          'Embed the post-state as a <spec-requirement>, or — if this is a data/content change — target the manifest key (e.g. standard/foo), not a requirement ID.',
      });
    }
    return findings;
  },
};
