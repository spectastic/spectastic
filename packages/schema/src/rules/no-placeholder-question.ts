import type { DefaultTreeAdapterTypes } from 'parse5';
import { findAll, getLocation } from '../parser.js';
import type { Finding, PerFileRule, Severity } from '../types.js';

type Element = DefaultTreeAdapterTypes.Element;
type ChildNode = DefaultTreeAdapterTypes.ChildNode;

/**
 * Flag a placeholder / "None" `<li>` inside a `<spec-questions>` register.
 *
 * Per REQ-AUTHOR-005 of the meta-spec, a register with no open questions
 * carries *no* `<li>` — each `<li>` counts as exactly one open question to
 * every consumer (health extraction, the lifecycle needs-attention signal,
 * validators). Resolved-with-rationale prose belongs in a `<p>`, never a
 * "None" `<li>`. This rule catches the non-conformant `<ol><li>None…</li>`
 * form that reads as a false open question.
 *
 * Severity is status-dependent (mirrors `no-unresolved-question`): `error`
 * once the doc reaches `accepted`, `warning` while `draft` or `review`, and
 * skipped otherwise — so frozen `applied` / `withdrawn` archives never fire.
 */
const SENTINEL = /^\s*(?:Q\d+[.)]?\s*)?(?:none\b|n\/?a\b)/i;

/** Concatenated text of an element (text nodes only, depth-first). */
function textOf(el: Element): string {
  let out = '';
  const visit = (node: ChildNode): void => {
    if (node.nodeName === '#text') {
      out += (node as DefaultTreeAdapterTypes.TextNode).value;
    } else if ('childNodes' in node) {
      for (const child of node.childNodes) visit(child);
    }
  };
  for (const child of el.childNodes) visit(child);
  return out;
}

export const noPlaceholderQuestionRule: PerFileRule = {
  id: 'no-placeholder-question',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    'A <spec-questions> register with no open questions carries no <li>; resolved rationale lives in a <p> (REQ-AUTHOR-005).',
  check({ doc }) {
    const severity = severityForStatus(doc.status);
    if (severity === undefined) return [];
    const findings: Finding[] = [];
    for (const register of findAll(doc.ast, 'spec-questions')) {
      for (const li of findAll(register, 'li')) {
        if (!SENTINEL.test(textOf(li).trim())) continue;
        const loc = getLocation(li);
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'no-placeholder-question',
          severity,
          message:
            'Placeholder "None" <li> in <spec-questions>; a register with no open questions carries no <li>.',
          fixHint:
            'Per REQ-AUTHOR-005, move the resolved rationale into a <p> (e.g. <p>None outstanding — …</p>) and drop the <li>. Each <li> counts as one open question to consumers.',
        });
      }
    }
    return findings;
  },
};

/**
 * Map a document status to the severity this rule should emit. Returns
 * `undefined` when no finding should be produced (status absent, or a
 * frozen archive status this rule does not score).
 */
function severityForStatus(status: string | undefined): Severity | undefined {
  if (status === 'accepted') return 'error';
  if (status === 'draft' || status === 'review') return 'warning';
  return undefined;
}
