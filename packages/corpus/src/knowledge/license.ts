/**
 * corpus-license — the folded validate scan flagging a corpus document
 * whose declared license isn't on a maintained permissive allowlist
 * (058-corpus-licensing, plan D-001/D-003). Deliberately conservative:
 * silence is earned only by a known-permissive SPDX-style id; a
 * known-restrictive license, an id the allowlist doesn't carry, or a
 * placeholder like `TODO` all warn — so an unrecognised license is never
 * silently waved through as permissive (the spec's §2 edge case). The
 * *missing*-license case is 051's existing error (a required provenance
 * field), not this rule's concern (plan D-002) — `corpusWellFormedFindings`
 * already reports it, more strictly than this rule's warn.
 */
import type { Finding } from '@spectastic/schema';
import type { CorpusPack } from './types.js';

const RULE = 'corpus-license';

/** Permissive SPDX-style identifiers (plan D-003), matched case-insensitively
 * by exact id. The Creative Commons Attribution family is the one deliberate
 * generalisation — CC_BY_PLAIN_RE below matches plain "CC-BY-<version>" but
 * deliberately NOT the NC/ND/SA variants (CC-BY-NC-4.0, CC-BY-ND-4.0,
 * CC-BY-SA-4.0), which impose real redistribution restrictions and must fall
 * through to the unrecognised/warn path — the conservative reading of the
 * plan's "CC-BY-*" shorthand. */
const PERMISSIVE_LICENSES: ReadonlySet<string> = new Set(
  ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'CC0-1.0', 'ISC', 'Unlicense', '0BSD', 'public-domain'].map(
    (id) => id.toLowerCase(),
  ),
);

/** Plain Creative Commons Attribution only — no NC (non-commercial), ND
 * (no-derivatives), or SA (share-alike) suffix, each of which restricts
 * redistribution in a way plain attribution doesn't. */
const CC_BY_PLAIN_RE = /^cc-by-\d+(\.\d+)*$/;

/** True only for a license string on the permissive allowlist (case-
 * insensitive, exact id, or the plain CC-BY family) — everything else,
 * including an empty/whitespace string, classifies as not-permissive
 * (D-003). Callers decide what an absent license means; 051 already owns
 * that case (plan D-002), so this function never sees `undefined`. */
export function isPermissiveLicense(license: string): boolean {
  const normalized = license.trim().toLowerCase();
  if (normalized.length === 0) return false;
  return PERMISSIVE_LICENSES.has(normalized) || CC_BY_PLAIN_RE.test(normalized);
}

function licenseFinding(file: string, license: string): Finding {
  return {
    file,
    line: 1,
    column: 1,
    rule: RULE,
    severity: 'warning',
    message: `${file} declares license "${license}", which restricts or isn't recognised as permissive — redistributing this document may be restricted.`,
    fixHint:
      "Confirm the license permits redistribution, or hold the source by reference instead (see the README's redistribution policy).",
  };
}

/** Every corpus-license finding across every loaded pack: one warning per
 * document whose declared license isn't on the permissive allowlist. A
 * document with no declared license at all is silently skipped here — it's
 * 051's existing error (`corpusWellFormedFindings`), and re-warning on it
 * would double-report the same gap (plan D-002). A no-op with an empty
 * corpus (NFR-001 — graceful absence holds all the way through). */
export function corpusLicenseFindings(packs: readonly CorpusPack[]): Finding[] {
  const findings: Finding[] = [];
  for (const pack of packs) {
    for (const doc of pack.documents) {
      const license = doc.provenance.license;
      if (license === undefined || license.trim().length === 0) continue; // 051's concern, not this rule's
      if (isPermissiveLicense(license)) continue;
      findings.push(licenseFinding(doc.filePath, license));
    }
  }
  return findings;
}
