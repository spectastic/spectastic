import { findAll } from '../parser.js';
import { readTokenSet } from '../token-set.js';
import type { Finding, PerFileRule } from '../types.js';
import { HIGHEST_TIER, TOKEN_SET_ELEMENT } from '../visual-vocabulary.js';

/**
 * `release-deprecation` (spec 098, FR-008/FR-009).
 *
 * Two rules about giving a consumer time. A token is not removed in the release
 * that deprecates it, so a rename ships the new name plus a working alias and
 * a reason — and a removal is classified at the highest tier, because it is the
 * one change that certainly breaks somebody.
 *
 * The deprecation itself lives in the token format's own channel, not here
 * (FR-007). This rule governs the RELEASE's claims about it, which is why it
 * can check the sequencing without parsing a token file. That split is stated
 * in the design as a real gap: nothing cross-checks that a release claiming a
 * deprecation actually made one.
 */

export const releaseDeprecationRule: PerFileRule = {
  id: 'release-deprecation',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    'A release must not remove a token it deprecates in the same breath, and a removal must be classified at the highest bump tier.',
  check({ doc }) {
    const findings: Finding[] = [];
    if (findAll(doc.ast, TOKEN_SET_ELEMENT).length === 0) return findings;

    const set = readTokenSet(doc);
    if (set === null) return findings;

    const flag = (at: { line: number; column: number }, message: string, fixHint: string): void => {
      findings.push({
        file: doc.file,
        line: at.line,
        column: at.column,
        rule: 'release-deprecation',
        severity: 'error',
        message,
        fixHint,
      });
    };

    for (const release of set.releases) {
      const removes = (release.removes ?? '').split(/\s+/).filter((s) => s !== '');
      const deprecates = new Set((release.deprecates ?? '').split(/\s+/).filter((s) => s !== ''));

      for (const token of removes) {
        if (deprecates.has(token)) {
          flag(
            release,
            `<spec-release> removes "${token}" in the same release that deprecates it`,
            'Deprecate in one release and remove in a later one (spec.html FR-008). A consumer needs at least one release in which the old name still works and tells them what replaced it.',
          );
        }
      }

      if (removes.length > 0 && release.changeClass !== HIGHEST_TIER) {
        flag(
          release,
          `<spec-release class="${release.changeClass ?? ''}"> removes a token but is not classified ${HIGHEST_TIER}`,
          `A removal is classified at the highest tier of the bump policy (spec.html FR-009) — it is the one change that certainly breaks somebody.`,
        );
      }
    }

    return findings;
  },
};
