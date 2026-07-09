import { findAll, getAttr, getLocation } from '../parser.js';
import type { CrossFileRule, Finding, ParsedDocument } from '../types.js';

/**
 * Flag a terminal-state spec bundle that carries no `verify.html` (spec
 * 021-verify-view FR-010). The presence sibling to `verify-view-stale`: that rule
 * guards a view that exists against drift; this one catches the absence
 * `verify-view-stale` short-circuits on (`if (!b.verify) continue`). Closes the
 * gap surfaced by triage 021/T-002 — 032–036 shipped Accepted with no verify.html
 * and validate stayed clean.
 *
 * Forward-only, no hard-coded boundary: the convention floor is the lowest spec
 * id in the validated set that already carries a `verify.html`. Specs below the
 * floor predate the convention and are exempt (001–020 today). Cross-file — it
 * needs whole-project context, like `no-broken-defer-to`; on a partial set it
 * derives the floor from what it is given and never guesses.
 */

const SPEC_FILE = /(?:^|\/)specs\/([^/]+)\/spec\.html$/;
const VERIFY_FILE = /(?:^|\/)specs\/([^/]+)\/verify\.html$/;
const TERMINAL = new Set(['accepted', 'superseded', 'deprecated']);

/** Leading numeric id of a spec dir, e.g. "032-triage-fanout" → 32; null if none. */
function specNum(specId: string): number | null {
  const m = /^(\d+)/.exec(specId);
  return m ? Number.parseInt(m[1]!, 10) : null;
}

/** The `<spec-status value="…">` of a spec doc, if declared. */
function specStatus(spec: ParsedDocument): string | undefined {
  const el = findAll(spec.ast, 'spec-status')[0];
  return el ? (getAttr(el, 'value') ?? undefined) : undefined;
}

export const verifyViewMissingRule: CrossFileRule = {
  id: 'verify-view-missing',
  scope: 'cross-file',
  defaultSeverity: 'error',
  description:
    'A terminal-state spec bundle at or above the verify-view convention floor must carry a verify.html (spec 021 FR-010).',
  check({ docs }): Finding[] {
    const specs = new Map<string, ParsedDocument>();
    const hasVerify = new Set<string>();
    for (const doc of docs) {
      const s = SPEC_FILE.exec(doc.file);
      if (s?.[1]) {
        specs.set(s[1], doc);
        continue;
      }
      const v = VERIFY_FILE.exec(doc.file);
      if (v?.[1]) hasVerify.add(v[1]);
    }

    // Convention floor: the lowest spec number that already carries a verify.html.
    let floor = Number.POSITIVE_INFINITY;
    for (const id of hasVerify) {
      const n = specNum(id);
      if (n !== null && n < floor) floor = n;
    }
    if (!Number.isFinite(floor)) return []; // no verify.html anywhere → no convention to enforce

    const findings: Finding[] = [];
    for (const [id, spec] of specs) {
      const n = specNum(id);
      if (n === null || n < floor) continue; // below the floor → predates the convention, exempt
      const status = specStatus(spec);
      if (!status || !TERMINAL.has(status)) continue; // not a completed bundle → not yet expected
      if (hasVerify.has(id)) continue; // present → fine
      const head = findAll(spec.ast, 'h1')[0] ?? findAll(spec.ast, 'html')[0];
      const loc = head ? getLocation(head) : { line: 1, column: 1 };
      findings.push({
        file: spec.file,
        line: loc.line,
        column: loc.column,
        rule: 'verify-view-missing',
        severity: 'error',
        message: `spec "${id}" is ${status} and at/above the verify-view floor (${floor}) but has no verify.html`,
        fixHint: `Generate the derived view with \`spectastic verify ${id}\` (or on \`/spectastic.implement\` completion).`,
      });
    }
    return findings;
  },
};
