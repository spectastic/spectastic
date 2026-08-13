import { findAll } from '../parser.js';
import { readTokenSet } from '../token-set.js';
import type { Finding, PerFileRule } from '../types.js';
import { CHANGE_CLASSES, TOKEN_SET_ELEMENT } from '../visual-vocabulary.js';

/**
 * `token-set-shape` (spec 098, FR-001/FR-002/FR-005).
 *
 * Three obligations, reported separately: a version, a forward-only binding,
 * and the bump policy stated *in this artifact*. The last is the unusual one —
 * a rule checking for the presence of prose — and it is here because a policy
 * that lives in documentation is a policy nobody reads at the moment of
 * bumping, which is precisely the moment it exists for.
 *
 * The change class is checked against the three bump tiers and nothing else.
 * It is the producer's claim: breaking-change detection for design tokens does
 * not exist in the way it does for API contracts, so no finding here asserts
 * whether a release breaks anything.
 */

/** Enough prose that the policy says something, rather than being a token gesture. */
const MIN_POLICY_CHARS = 40;

export const tokenSetShapeRule: PerFileRule = {
  id: 'token-set-shape',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    'A <spec-token-set> must carry a version, a forward-only binding, its bump policy as prose, and releases classified with one of the three bump tiers.',
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
        rule: 'token-set-shape',
        severity: 'error',
        message,
        fixHint,
      });
    };

    if (set.version === undefined || set.version === '') {
      flag(
        set,
        '<spec-token-set> is missing required version=',
        'Give the token set a semantic version (spec.html FR-001). It answers "which rules was this built under", which is what makes conformance recoverable after a later bump.',
      );
    }

    if (set.bindsFrom === undefined || set.bindsFrom === '') {
      flag(
        set,
        '<spec-token-set> is missing required binds-from=',
        'State the version this one binds forward from (spec.html FR-002). Without it every change to a shared design system is a migration project, which is why most teams stop making them.',
      );
    }

    if (set.policy.length < MIN_POLICY_CHARS) {
      flag(
        set,
        '<spec-token-set> states no bump policy',
        "Write the policy as this element's own prose — what makes a change MAJOR, MINOR or PATCH (spec.html FR-001). A policy that lives in documentation is one nobody reads at the moment of bumping.",
      );
    }

    for (const release of set.releases) {
      if (release.changeClass === undefined || !CHANGE_CLASSES.includes(release.changeClass as never)) {
        flag(
          release,
          `<spec-release class="${release.changeClass ?? ''}"> is not one of the bump tiers`,
          `Use one of ${CHANGE_CLASSES.join(', ')} (spec.html FR-005). It is the producer's claim and nothing verifies it — breaking-change detection for tokens does not exist the way it does for an API contract.`,
        );
      }
      if (release.from === undefined || release.to === undefined) {
        flag(
          release,
          '<spec-release> must declare both the version it was written against and the version it produces',
          'Add from= and to= (spec.html FR-004). The guard compares from= against the live version for equality, which is what stops a stale amendment landing on top of one it never saw.',
        );
      }
    }

    return findings;
  },
};
