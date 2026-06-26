import { findAll, getAttr, getLocation, walk } from '../parser.js';
import type { Element } from '../parser.js';
import type { CrossFileRule, Finding, ParsedDocument } from '../types.js';

/**
 * Keep the spec-budget band threshold from drifting between its single source
 * of truth and any requirement that restates it.
 *
 * `REQ-FORMAT-004` (the meta-spec) owns the RAG bands — green ≤ 80%, amber
 * > 80–100%, red > 100%. Other requirements (e.g. 011-core-spec `FR-008`)
 * defer to it with "per REQ-FORMAT-004", but for reader convenience some also
 * restate the figure ("the amber band (≥ 80% …)"). That restatement is a
 * convenience, not a second definition (proposal 2026-06-25-spec-budget-bands,
 * risk R-3) — so when an edit moves the band in one place but not the other,
 * this rule makes the divergence loud.
 *
 * Cross-file by nature: it only fires when REQ-FORMAT-004 and the restating
 * requirement are in the validated set together. A requirement that defers
 * without restating a percentage cannot drift, so it is never flagged.
 *
 * Scope note: this guards the HTML↔HTML coupling the validate engine can see.
 * It does NOT guard the `assets/spec.js` gauge value — that JS asset is in no
 * validated bundle, so the engine never parses it; a vitest backstop would be
 * the place for that check.
 */

const SSOT_ID = 'REQ-FORMAT-004';

function textOf(el: Element): string {
  let out = '';
  walk(el, (node) => {
    for (const child of node.childNodes) {
      if ('value' in child && typeof child.value === 'string' && !('tagName' in child)) {
        out += child.value;
      }
    }
  });
  return out.replace(/\s+/g, ' ').trim();
}

/** The band threshold REQ-FORMAT-004 declares, read from its green upper bound ("green ≤ 80%"). */
function ssotThreshold(text: string): number | undefined {
  const m = /green[^%]{0,12}?(\d{1,3})\s*%/i.exec(text);
  return m ? Number(m[1]) : undefined;
}

/** The amber-band percentage a requirement restates ("the amber band (≥ 80% …)"), if any. */
function restatedThreshold(text: string): number | undefined {
  const m = /amber[^%]{0,24}?(\d{1,3})\s*%/i.exec(text);
  return m ? Number(m[1]) : undefined;
}

function findRequirement(docs: readonly ParsedDocument[], id: string): { doc: ParsedDocument; el: Element } | undefined {
  for (const doc of docs) {
    for (const req of findAll(doc.ast, 'spec-requirement')) {
      if (getAttr(req, 'id') === id) return { doc, el: req };
    }
  }
  return undefined;
}

export const formatBandCouplingRule: CrossFileRule = {
  id: 'format-band-coupling',
  scope: 'cross-file',
  defaultSeverity: 'error',
  description:
    'A requirement that restates REQ-FORMAT-004’s amber band must use the same percentage REQ-FORMAT-004 defines.',
  check({ docs }): Finding[] {
    const findings: Finding[] = [];

    const ssot = findRequirement(docs, SSOT_ID);
    if (!ssot) return findings; // SSOT not in the validated set — no signal.
    const canonical = ssotThreshold(textOf(ssot.el));
    if (canonical === undefined) return findings; // unparseable — never a false positive.

    for (const doc of docs) {
      for (const req of findAll(doc.ast, 'spec-requirement')) {
        const id = getAttr(req, 'id');
        if (!id || id === SSOT_ID) continue;
        const text = textOf(req);
        if (!text.includes(SSOT_ID)) continue; // not coupled to REQ-FORMAT-004.
        const restated = restatedThreshold(text);
        if (restated === undefined || restated === canonical) continue; // defers cleanly or agrees.

        const loc = getLocation(req);
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'format-band-coupling',
          severity: 'error',
          message: `${id} restates the amber band as ${restated}% but ${SSOT_ID} defines it as ${canonical}%.`,
          fixHint: `Update ${id} to ${canonical}% to match ${SSOT_ID}, or drop the parenthetical and rely on "per ${SSOT_ID}".`,
        });
      }
    }
    return findings;
  },
};
