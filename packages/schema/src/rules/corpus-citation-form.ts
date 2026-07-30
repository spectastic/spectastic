import { findCitationTokens, parseCorpusCitation } from '../citation-shared.js';
import type { Element } from '../parser.js';
import { findAll, getLocation } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';

/**
 * `corpus-citation-form` (spec 052-corpus-citation-contract, FR-002, plan D-002).
 *
 * A corpus citation inside a `<spec-decision>` MUST be edition-pinned —
 * `KB-NNNN@edition`, the project-assigned, opaque, 4-digit-baseline id
 * (2026-07-26-hybrid-corpus-citation, T-1004; the grammar itself is
 * unchanged — `\d{3,}` already admitted 4+ digits, so a pre-migration
 * 3-digit `KB-NNN` citation still parses) — so a later re-ingest can never
 * silently change what a historical decision claimed to have read. A bare
 * `KB-NNNN` (no `@edition`) or a malformed pin SHOULD warn.
 *
 * This is an HTML per-file rule, not a folded CLI scan (051's markdown case):
 * citations live in `<spec-decision>` HTML, so the HTML-bound schema registry
 * is the right layer. It needs no corpus to run — a pure grammar check via
 * the shared `citation-shared` parser (the `slo-shared` precedent). The
 * resolve/staleness gates that DO need the corpus are 053's, which reuse the
 * same `findCitationTokens` extraction (053 plan D-003) so the two agree on
 * what a citation token is.
 *
 * Warning severity, scoped to `<spec-decision>` content: a KB-shaped string
 * in ordinary prose is left alone, and a false positive costs a glance, never
 * a blocked build (plan §8 R4).
 */

/** Collect an element's visible text, collapsed (mirrors slo-well-formed's textOf). */
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

export const corpusCitationFormRule: PerFileRule = {
  id: 'corpus-citation-form',
  scope: 'per-file',
  defaultSeverity: 'warning',
  description:
    'A corpus citation in a <spec-decision> should be edition-pinned (KB-NNNN@edition); a bare or malformed one warns.',
  check({ doc }) {
    const findings: Finding[] = [];
    for (const decision of findAll(doc.ast, 'spec-decision')) {
      const text = textOf(decision);
      for (const token of findCitationTokens(text)) {
        const citation = parseCorpusCitation(token);
        if (citation !== null && citation.edition !== null) continue; // well-formed pin
        const loc = getLocation(decision);
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'corpus-citation-form',
          severity: 'warning',
          message: `Corpus citation "${token}" is not edition-pinned — cite it as KB-NNNN@edition so a later re-ingest can't silently change what this decision grounded against.`,
          fixHint: 'Add the edition the claim was grounded against, e.g. KB-0001@2024-05-28.',
        });
      }
    }
    return findings;
  },
};
