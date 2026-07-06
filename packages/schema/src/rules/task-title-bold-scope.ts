import { findAll, getAttr, getLocation } from '../parser.js';
import type { Element } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';

/**
 * Warn when a `<spec-task>` row is bolded end-to-end instead of leading with a
 * short `<strong>` title and carrying its detail in plain-weight prose.
 *
 * Per REQ-LIFECYCLE-003 of the meta-spec, a task row's leading emphasis is a
 * *short imperative title only* — supplementary detail follows in plain weight
 * (conventionally after an em-dash). The template's `<strong>[TASK]</strong>`
 * placeholder was read literally across specs 026–030, so every task line came
 * out fully bold — a wall of bold with no title/detail contrast (triage T-010).
 *
 * The heuristic is a deliberate conjunction (risk 1 of the proposal): warn only
 * when the leading `<strong>` *both* spans most of the row *and* the row carries
 * detail beyond a title — signalled by bold running past an em-dash, or by the
 * prose exceeding a length floor. A terse, detail-free title that legitimately
 * fills its own row is left alone, and a bare colon/semicolon in a title is not
 * a signal (titles carry them routinely). Warn, not error: the heuristic is
 * advisory and its floor is tunable, so it never gates CI.
 *
 * The `<span class="path">` file/dir pointer is metadata, not prose, so it is
 * excluded from the row's measured text.
 */

/** The leading <strong> must be at least this fraction of the row's prose. */
const SPAN_RATIO = 0.8;
/** Prose longer than this (chars) is taken to carry detail beyond a title. */
const LENGTH_FLOOR = 60;

/** Collect an element's text, skipping any `<span class="path">` subtree. */
function proseText(el: Element): string {
  let out = '';
  const visit = (node: unknown): void => {
    const n = node as {
      tagName?: string;
      attrs?: { name: string; value: string }[];
      value?: string;
      childNodes?: unknown[];
    };
    // Skip the path pointer — it is structural metadata, not row prose.
    if (n.tagName === 'span' && n.attrs?.some((a) => a.name === 'class' && a.value.split(/\s+/).includes('path'))) {
      return;
    }
    if (n.tagName === undefined && typeof n.value === 'string') out += n.value;
    if (n.childNodes) for (const child of n.childNodes) visit(child);
  };
  visit(el);
  return out.replace(/\s+/g, ' ').trim();
}

export const taskTitleBoldScopeRule: PerFileRule = {
  id: 'task-title-bold-scope',
  scope: 'per-file',
  defaultSeverity: 'warning',
  description:
    'A <spec-task> row should lead with a short <strong> title, not bold the whole detailed line.',
  check({ doc }) {
    const findings: Finding[] = [];
    for (const task of findAll(doc.ast, 'spec-task')) {
      const strong = findAll(task, 'strong')[0];
      if (!strong) continue; // no leading emphasis to over-scope

      const strongText = proseText(strong);
      const rowText = proseText(task);
      if (rowText.length === 0) continue;

      const spansMost = strongText.length / rowText.length >= SPAN_RATIO;
      const detailPresent = strongText.includes('—') || rowText.length > LENGTH_FLOOR;
      if (!(spansMost && detailPresent)) continue;

      const loc = getLocation(task);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'task-title-bold-scope',
        severity: 'warning',
        message: `<spec-task${
          getAttr(task, 'id') ? ` id="${getAttr(task, 'id')}"` : ''
        }> bolds the whole row — <strong> should wrap a short title, not the full detailed line.`,
        fixHint:
          'Keep <strong> around a short imperative title; move the detail out of the <strong> into plain-weight prose after an em-dash.',
      });
    }
    return findings;
  },
};
