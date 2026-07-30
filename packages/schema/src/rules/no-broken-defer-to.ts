import { findAll, getAttr, getLocation } from '../parser.js';
import type { CrossFileRule, Finding } from '../types.js';

const NEVER = 'never';
const TBD = /^TBD(-.+)?$/;
const SPEC_ID = /^[0-9]+-[a-z][a-z0-9-]*$/;
const SPEC_FILE = /(?:^|\/)specs\/([^/]+)\/spec\.html$/;

/**
 * Flag any `<spec-out-of-scope> <li defer-to="…">` whose value is not
 * `never`, not `TBD` / `TBD-<topic>`, not a well-formed spec ID, or — when
 * the validation set is wide enough to know — does not resolve to a spec
 * actually present in the set.
 *
 * Companion to [[no-missing-defer-to]]: that rule catches the missing
 * attribute; this rule catches the wrong attribute value. The two together
 * close the "decorative deferral" gap where a typo in the target ID renders
 * cleanly because the runtime warning only fires on absence.
 *
 * Existence-check semantics:
 *
 *  - Lexical malformed (e.g. `defer-to="foo bar"`, `defer-to=""`,
 *    `defer-to="not-a-spec-format"`) → fire unconditionally.
 *  - Spec-ID-format value not present in the validation set → fire ONLY
 *    when the set has 2+ documents. Single-doc validation has no signal
 *    for whether the target sibling exists; the existence check is
 *    skipped to avoid false positives.
 *  - Sentinels (`never`, `TBD`, `TBD-*`) → never fire.
 *
 * Closes one of the slicing-gaps surfaced by the 16 Jun 2026 audit.
 */
export const noBrokenDeferToRule: CrossFileRule = {
  id: 'no-broken-defer-to',
  scope: 'cross-file',
  defaultSeverity: 'error',
  description:
    '<spec-out-of-scope defer-to="…"> values must be `never`, `TBD` / `TBD-<topic>`, or an existing sibling spec ID.',
  check({ docs }) {
    const findings: Finding[] = [];

    const knownSpecIds = new Set<string>();
    for (const doc of docs) {
      const m = SPEC_FILE.exec(doc.file);
      if (m?.[1]) knownSpecIds.add(m[1]);
    }
    const canCheckExistence = docs.length >= 2;

    for (const doc of docs) {
      for (const block of findAll(doc.ast, 'spec-out-of-scope')) {
        for (const li of findAll(block, 'li')) {
          const value = getAttr(li, 'defer-to');
          if (value === undefined) continue;

          if (value === NEVER) continue;
          if (TBD.test(value)) continue;

          if (SPEC_ID.test(value)) {
            if (!canCheckExistence) continue;
            if (knownSpecIds.has(value)) continue;
            const loc = getLocation(li);
            findings.push({
              file: doc.file,
              line: loc.line,
              column: loc.column,
              rule: 'no-broken-defer-to',
              severity: 'error',
              message: `defer-to="${value}" points at a spec that is not in the validation set`,
              fixHint:
                'Check the spec ID for typos; if the spec was renamed, update the reference. Run against the whole project (e.g. `spectastic validate "specs/**/*.html" "examples/**/*.html"`) so the existence check has full context.',
            });
            continue;
          }

          const loc = getLocation(li);
          findings.push({
            file: doc.file,
            line: loc.line,
            column: loc.column,
            rule: 'no-broken-defer-to',
            severity: 'error',
            message: `defer-to="${value}" is not a recognised target`,
            fixHint:
              'Use defer-to="never" for permanent deferral, defer-to="TBD" / defer-to="TBD-<topic>" when undecided, or defer-to="<digits>-<kebab>" to point at a sibling spec.',
          });
        }
      }
    }
    return findings;
  },
};
