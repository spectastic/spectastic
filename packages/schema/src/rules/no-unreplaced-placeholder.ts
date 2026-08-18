import type { Finding, PerFileRule, Severity } from '../types.js';

/**
 * Flag an unreplaced template placeholder in a published artifact
 * (REQ-FORMAT-009 of the meta-spec).
 *
 * Every authoring command already says to replace them all, which is guidance
 * in markdown and therefore not a guarantee — triage T-009 and P-8 both
 * exclude command text as a place a guarantee may live. Nine shipped this way
 * before the check existed, in an applied and a withdrawn proposal.
 *
 * Every one of those nine sat in the `<title>`, the `<spec-change>` wrapper or
 * the footer: the chrome outside the sections an author writes. Nobody misses
 * a scope item, because writing scope is the task.
 *
 * Quotation is exempt, and the exemption is derived rather than assumed. All
 * remaining placeholder-shaped strings in the estate are quotation — a code
 * block, a preformatted block, or a `<spec-diff>` quoting template markup. The
 * diff case was found by chasing why a census disagreed with itself, not by
 * guessing at it.
 *
 * Severity is status-dependent, cloning `no-placeholder-question`: an archived
 * or withdrawn proposal is a stable fact under 088 and can never be edited to
 * satisfy a gate, so it must not fail one.
 */

/** Template placeholders are UPPER_SNAKE in square brackets. */
const PLACEHOLDER_RE = /\[[A-Z][A-Z0-9_]{3,}\]/g;

/** Elements whose content quotes markup rather than asserting it. */
const QUOTING = ['code', 'pre', 'spec-diff'];

/**
 * Spans the scan skips: quoting elements, and HTML comments. A comment is not
 * published copy — it cannot mislead a reader — and the templates document
 * their own placeholders inside comments.
 */
function quotedSpans(html: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const comment = /<!--/g;
  let c: RegExpExecArray | null;
  while ((c = comment.exec(html))) {
    const end = html.indexOf('-->', c.index);
    spans.push([c.index, end === -1 ? html.length : end + 3]);
    comment.lastIndex = end === -1 ? html.length : end + 3;
  }
  for (const tag of QUOTING) {
    const open = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = open.exec(html))) {
      const close = html.toLowerCase().indexOf(`</${tag}`, open.lastIndex);
      const end = close === -1 ? html.length : close;
      spans.push([m.index, end]);
      open.lastIndex = end;
    }
  }
  return spans;
}

function positionAt(html: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (html.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

/**
 * Map a document status to the severity to emit, or `undefined` for none.
 * Mirrors `no-placeholder-question` exactly — see this file's header for why
 * a frozen archive must be skipped rather than merely downgraded.
 */
function severityForStatus(status: string | undefined): Severity | undefined {
  if (status === 'accepted') return 'error';
  if (status === 'draft' || status === 'review') return 'warning';
  return undefined;
}

export const noUnreplacedPlaceholderRule: PerFileRule = {
  id: 'no-unreplaced-placeholder',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    'A published artifact carries no unreplaced template placeholder; quotation in code, pre or a diff is exempt (REQ-FORMAT-009).',
  check({ doc }) {
    const severity = severityForStatus(doc.status);
    if (severity === undefined) return [];

    const html = doc.html;
    const quoted = quotedSpans(html);
    const isQuoted = (i: number): boolean => quoted.some(([a, b]) => i >= a && i < b);

    const findings: Finding[] = [];
    let m: RegExpExecArray | null;
    PLACEHOLDER_RE.lastIndex = 0;
    while ((m = PLACEHOLDER_RE.exec(html))) {
      if (isQuoted(m.index)) continue;
      const at = positionAt(html, m.index);
      findings.push({
        file: doc.file,
        line: at.line,
        column: at.column,
        rule: 'no-unreplaced-placeholder',
        severity,
        message: `Unreplaced template placeholder ${m[0]}.`,
        fixHint:
          'Replace it with the real value. Check the <title>, the change wrapper and the footer — placeholders survive in the chrome outside the sections an author edits.',
      });
    }
    return findings;
  },
};
