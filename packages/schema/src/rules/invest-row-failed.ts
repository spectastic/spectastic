import { findAll, getAttr, getLocation } from '../parser.js';
import type { Element, Finding, PerFileRule, Severity } from '../types.js';

/**
 * Flag any `<dl class="invest">` that contains at least one `<dd class="fail">`
 * row. A failing INVEST self-check signals a story-quality problem the author
 * acknowledged inline; downstream gates should react to it.
 *
 * Severity is status-dependent: an unresolved fail blocks planning (`error`
 * for `review`/`accepted`) but only warns during `draft`. Other statuses skip.
 *
 * Implements FR-012 of specs/002-validate-cli/spec.html.
 */
export const investRowFailedRule: PerFileRule = {
  id: 'invest-row-failed',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: '<dl class="invest"> must not contain <dd class="fail"> rows in review/accepted specs.',
  check({ doc }) {
    const status = doc.status ?? 'draft';
    const severity = severityForStatus(status);
    if (severity === undefined) return [];

    const findings: Finding[] = [];
    const investDls = findAll(doc.ast, 'dl').filter((dl) => hasClass(dl, 'invest'));
    for (const dl of investDls) {
      const fails = findAll(dl, 'dd').filter((dd) => hasClass(dd, 'fail'));
      if (fails.length === 0) continue;
      const loc = getLocation(fails[0]!);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'invest-row-failed',
        severity,
        message: 'INVEST self-check has a failing row (<dd class="fail">).',
        fixHint:
          'Resolve the failing INVEST criterion (split the story, sharpen the value, etc.) and drop the fail class, or keep status=draft until resolved.',
      });
    }
    return findings;
  },
};

function hasClass(el: Element, cls: string): boolean {
  const v = getAttr(el, 'class');
  if (!v) return false;
  return v.split(/\s+/).includes(cls);
}

function severityForStatus(status: string): Severity | undefined {
  if (status === 'review' || status === 'accepted') return 'error';
  if (status === 'draft') return 'warning';
  return undefined;
}
