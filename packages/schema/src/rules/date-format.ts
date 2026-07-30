import type { Element } from '../parser.js';
import { findAll, getAttr, getLocation } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';

/**
 * Warn when a `<time>` element's date is off the canonical format.
 *
 * Per REQ-FORMAT-005 of the meta-spec, every date is a `<time>` whose
 * `datetime=` attribute is a valid ISO 8601 date (`YYYY-MM-DD`, or a fuller ISO
 * timestamp) and whose visible text renders as `DD Mon YYYY` — a zero-padded
 * two-digit day, a three-letter title-case month, and a four-digit year
 * (e.g. `06 Jul 2026`, not `6 Jul 2026` and not `2026-07-06`). The display text
 * was unowned, so it drifted between `2026-06-29` and `29 Jun 2026` even within
 * one artifact (triage T-011).
 *
 * Warn, not error: the corpus carries many not-yet-normalized displays, and an
 * error-level rule would break the SC-001 "zero error findings" integration gate
 * before the normalization cleanup drains. Severity is revisitable once clean.
 */

/** ISO 8601 calendar date, optionally with a time component. */
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;
/** Canonical human display: zero-padded day, title-case 3-letter month, 4-digit year. */
const DISPLAY = /^(0[1-9]|[12]\d|3[01]) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/;

/** Collect an element's visible text, collapsed. */
function textOf(el: Element): string {
  let out = '';
  const visit = (node: unknown): void => {
    const n = node as {
      tagName?: string;
      value?: string;
      childNodes?: unknown[];
    };
    if (n.tagName === undefined && typeof n.value === 'string') out += n.value;
    if (n.childNodes) for (const child of n.childNodes) visit(child);
  };
  visit(el);
  return out.replace(/\s+/g, ' ').trim();
}

export const dateFormatRule: PerFileRule = {
  id: 'date-format',
  scope: 'per-file',
  defaultSeverity: 'warning',
  description: '<time> must carry an ISO 8601 datetime= and render its text as zero-padded "DD Mon YYYY".',
  check({ doc }) {
    const findings: Finding[] = [];
    for (const time of findAll(doc.ast, 'time')) {
      const problems: string[] = [];

      const datetime = getAttr(time, 'datetime');
      if (datetime === undefined) {
        problems.push('missing an ISO 8601 datetime= attribute');
      } else if (!ISO_DATETIME.test(datetime)) {
        problems.push(`datetime="${datetime}" is not ISO 8601 (YYYY-MM-DD)`);
      }

      const display = textOf(time);
      if (!DISPLAY.test(display)) {
        problems.push(`display text "${display}" is not zero-padded "DD Mon YYYY"`);
      }

      if (problems.length === 0) continue;

      const loc = getLocation(time);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'date-format',
        severity: 'warning',
        message: `<time> off canonical date format — ${problems.join('; ')}.`,
        fixHint:
          'Use <time datetime="YYYY-MM-DD">DD Mon YYYY</time> with a zero-padded day, e.g. datetime="2026-07-06">06 Jul 2026.',
      });
    }
    return findings;
  },
};
