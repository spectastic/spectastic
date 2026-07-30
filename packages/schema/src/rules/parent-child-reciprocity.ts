import { findAll, getAttr, getLocation } from '../parser.js';
import type { CrossFileRule, Finding, ParsedDocument } from '../types.js';

const SPEC_FILE = /(?:^|\/)specs\/([^/]+)\/spec\.html$/;

/**
 * Verify parent → child slicing reciprocity, child-side direction.
 *
 * For every document that declares `<spec-parent specid="X">`, when the
 * parent spec X is also present in the validation set, X MUST carry a
 * matching `<spec-out-of-scope> <li defer-to="<this-spec-id>">` recording
 * the carve-out. If the parent doesn't, the relationship is one-sided —
 * the child knows about the parent; the parent doesn't know it's been
 * sliced.
 *
 * Completes the practical lower bound on slicing consistency:
 *
 *   - [[spec-parent-well-formed]] checks that `<spec-parent specid="…">`
 *     is well-formed at all.
 *   - [[no-broken-defer-to]] checks that `defer-to="…"` resolves to a
 *     real target (when the set is wide enough to tell).
 *   - This rule checks that the two halves point at each other.
 *
 * Scope decisions:
 *
 *   - Only child → parent direction is enforced. The parent → child
 *     direction would over-fire on legitimate non-parent/child defer-tos
 *     (a spec deferring scope to a sibling that took over the work,
 *     without being its child).
 *   - Reciprocity is only checked when both parent and child are in the
 *     validation set. Single-doc validation skips the check. Wide-glob
 *     project validation engages it.
 *
 * Closes the cross-file reciprocity follow-up surfaced by the 16 Jun 2026
 * slicing audit (listed under §5 of `examples/slicing-gaps.html`).
 */
export const parentChildReciprocityRule: CrossFileRule = {
  id: 'parent-child-reciprocity',
  scope: 'cross-file',
  defaultSeverity: 'error',
  description:
    'When a doc declares <spec-parent specid="X">, X must contain <spec-out-of-scope defer-to="<this-spec-id>"> if X is in the validation set.',
  check({ docs }) {
    const findings: Finding[] = [];

    const docBySpecId = new Map<string, ParsedDocument>();
    for (const doc of docs) {
      const m = SPEC_FILE.exec(doc.file);
      if (m?.[1]) docBySpecId.set(m[1], doc);
    }

    for (const childDoc of docs) {
      const childMatch = SPEC_FILE.exec(childDoc.file);
      if (!childMatch?.[1]) continue;
      const childSpecId = childMatch[1];

      for (const parentEl of findAll(childDoc.ast, 'spec-parent')) {
        const parentSpecId = getAttr(parentEl, 'specid');
        if (!parentSpecId) continue;

        const parentDoc = docBySpecId.get(parentSpecId);
        if (!parentDoc) continue;

        const hasReciprocal = findAll(parentDoc.ast, 'spec-out-of-scope').some((block) =>
          findAll(block, 'li').some((li) => getAttr(li, 'defer-to') === childSpecId),
        );

        if (hasReciprocal) continue;

        const loc = getLocation(parentEl);
        findings.push({
          file: childDoc.file,
          line: loc.line,
          column: loc.column,
          rule: 'parent-child-reciprocity',
          severity: 'error',
          message: `parent spec "${parentSpecId}" is in the validation set but lacks a reciprocal <spec-out-of-scope defer-to="${childSpecId}">`,
          fixHint: `Add an <li defer-to="${childSpecId}"> entry to the <spec-out-of-scope> block in specs/${parentSpecId}/spec.html naming what was carved out.`,
          relatedLocations: [{ file: parentDoc.file, line: 1, column: 1 }],
        });
      }
    }
    return findings;
  },
};
