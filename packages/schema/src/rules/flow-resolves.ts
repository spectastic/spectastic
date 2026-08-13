import { findAll } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';
import { declaredScreenIds, readScreenFlows } from '../screen-flow.js';
import { FLOW_ELEMENT } from '../visual-vocabulary.js';

/**
 * `flow-resolves` (spec 100-screen-flows, FR-002/FR-006).
 *
 * A step either names a screen this document declares, or declares that it
 * leaves the feature. There is deliberately no third case, and that is what
 * lets an unresolvable reference be an error without forcing an author to
 * declare screens they do not own.
 *
 * Outward is DECLARED, never inferred from a failed resolution (FR-006). The
 * tempting shortcut — treat anything that fails to resolve as a boundary —
 * would make a typo and a deliberate boundary the same silent outcome, and
 * those are the two most common cases.
 *
 * Three things this rule deliberately does NOT do:
 *
 *  - It never reports an absent branch (FR-005). A journey that records no
 *    failure path means nobody wrote one down, which is different from "no
 *    failure is possible", and only the second would be worth a finding.
 *  - It never reports a cycle (FR-007). A converter that clears and is used
 *    again returns to where it started. The precedence graph in core detects
 *    cycles because a cycle there is a contradiction; here it is a loop, and
 *    conflating the two would report ordinary behaviour as an error.
 *  - It never resolves a step against another document. Everything a journey
 *    references lives in the same sidecar, which is what keeps this rule pure.
 */

export const flowResolvesRule: PerFileRule = {
  id: 'flow-resolves',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: 'Every step in a journey must reference a declared screen, or declare that it leaves the feature.',
  check({ doc }) {
    const findings: Finding[] = [];
    if (findAll(doc.ast, FLOW_ELEMENT).length === 0) return findings;

    const screens = declaredScreenIds(doc);
    const flag = (at: { line: number; column: number }, message: string, fixHint: string): void => {
      findings.push({
        file: doc.file,
        line: at.line,
        column: at.column,
        rule: 'flow-resolves',
        severity: 'error',
        message,
        fixHint,
      });
    };

    for (const flow of readScreenFlows(doc)) {
      if (flow.steps.length === 0) {
        flag(
          flow,
          '<spec-flow> declares no steps, so it records a route through nothing',
          'Add the steps this journey passes through, in the order they occur (spec.html FR-001) — the order is the content, and source order carries it.',
        );
        continue;
      }

      for (const step of flow.steps) {
        if (step.outward) {
          // A declared boundary. It resolves to nothing on purpose, and the
          // rule must stay silent or FR-006's whole point is lost.
          if (step.screen !== undefined) {
            flag(
              step,
              `<spec-step outward screen="${step.screen}"> both leaves the feature and names a screen in it`,
              'An outward step goes somewhere this feature does not declare, so drop screen= or drop outward (spec.html FR-006). Both together are two claims that cannot be true at once.',
            );
          }
          continue;
        }
        if (step.screen === undefined) {
          flag(
            step,
            '<spec-step> names no screen and does not declare that it leaves the feature',
            'Add screen= naming a screen this document declares, or mark the step outward if it goes somewhere this feature does not own (spec.html FR-002/FR-006).',
          );
          continue;
        }
        if (!screens.has(step.screen)) {
          flag(
            step,
            `<spec-step screen="${step.screen}"> names a screen this document does not declare`,
            'A step must reference a declared screen (spec.html FR-002) — a reference to nothing reads as a route and records none. If the destination genuinely belongs to another feature, mark the step outward instead.',
          );
        }
      }
    }

    return findings;
  },
};
