import type { Element } from '../parser.js';
import { findAll, getAttr, getLocation } from '../parser.js';
import { COMPATIBILITY_DIRECTIONS, COMPATIBILITY_SCOPES, RECOGNISED_SHAPES } from '../contract-shared.js';
import type { Finding, PerFileRule } from '../types.js';

/**
 * `contract-declaration-shape` (spec 069-design-contract-section, D-005; extended
 * by spec 077-event-schema-evolution, T-211). A `<spec-contract>` declares the
 * interface a feature exposes and, where one exists, the effective contract path
 * — see spec.html FR-002/FR-003/FR-004. This rule fires only on a PRESENT
 * declaration that is malformed:
 *
 *  - `shape=` is missing or is not one of the five recognised tokens.
 *  - a shape other than `none` carries no `path=` (a declared interface with
 *    no declared contract location).
 *  - `compatibility=` is present but not one of the four registry terms
 *    (077 D-001).
 *  - `compatibility-scope=` is present but not one of the two recognised
 *    scopes (077 D-001).
 *  - `compatibility-scope=` is present with no `compatibility=` — incoherent,
 *    since the scope question only makes sense once a direction has been
 *    claimed (077 D-001).
 *
 * Both compatibility attributes are optional and absent is always legal —
 * most contracts carry no compatibility stance at all.
 *
 * It never fires on a document with no `<spec-contract>` at all — the
 * meaningful check on a declaration that *is* well-formed but points at a
 * file that doesn't exist is 070-contract-sidecar-convention's resolve rule.
 * Every violation is reported granularly, mirroring `slo-well-formed`.
 */

export const contractDeclarationShapeRule: PerFileRule = {
  id: 'contract-declaration-shape',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: '<spec-contract> must carry a recognised shape=, and a shape other than "none" must carry a path=.',
  check({ doc }) {
    const findings: Finding[] = [];
    // The common case is a document with no <spec-contract> — return before
    // any further work, so a contract-less doc (every design today) costs
    // one cheap findAll, not more.
    const contracts = findAll(doc.ast, 'spec-contract');
    if (contracts.length === 0) return findings;

    const flag = (el: Element, message: string, fixHint: string): void => {
      const loc = getLocation(el);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'contract-declaration-shape',
        severity: 'error',
        message,
        fixHint,
      });
    };

    for (const contract of contracts) {
      const shape = getAttr(contract, 'shape');

      if (shape === undefined || shape === '') {
        flag(
          contract,
          '<spec-contract> is missing required shape=',
          'Set shape= to one of request-response, rpc, graphql, event-driven, or none (spec.html FR-004).',
        );
        continue; // an absent/empty shape can't also be checked for path=
      }

      if (!RECOGNISED_SHAPES.includes(shape as (typeof RECOGNISED_SHAPES)[number])) {
        flag(
          contract,
          `<spec-contract shape="${shape}"> is not a recognised shape`,
          'Use one of request-response, rpc, graphql, event-driven, or none (spec.html FR-004) — an unrecognised token is rejected loudly rather than silently accepted.',
        );
        continue;
      }

      if (shape !== 'none' && getAttr(contract, 'path') === undefined) {
        flag(
          contract,
          `<spec-contract shape="${shape}"> declares an interface with no path=`,
          'Add path= naming the project-relative location of the contract file (spec.html FR-002). Only shape="none" may omit it.',
        );
      }

      // Compatibility stance (077-event-schema-evolution, D-001) — both attributes
      // are optional; absent is always legal. Checked independently of the shape
      // validation above so a shape= problem doesn't mask a compatibility= one.
      const compatibility = getAttr(contract, 'compatibility');
      const scope = getAttr(contract, 'compatibility-scope');

      if (
        compatibility !== undefined &&
        !COMPATIBILITY_DIRECTIONS.includes(compatibility as (typeof COMPATIBILITY_DIRECTIONS)[number])
      ) {
        flag(
          contract,
          `<spec-contract compatibility="${compatibility}"> is not a recognised compatibility direction`,
          `Use one of ${COMPATIBILITY_DIRECTIONS.join(', ')} (spec 077-event-schema-evolution, D-001) — each carries its meaning inline in the design interview, so the bare term alone is never shown.`,
        );
      }

      if (scope !== undefined && !COMPATIBILITY_SCOPES.includes(scope as (typeof COMPATIBILITY_SCOPES)[number])) {
        flag(
          contract,
          `<spec-contract compatibility-scope="${scope}"> is not a recognised scope`,
          `Use one of ${COMPATIBILITY_SCOPES.join(', ')} (spec 077-event-schema-evolution, D-001) — latest checks the immediately preceding version, all checks every retained message.`,
        );
      }

      if (scope !== undefined && compatibility === undefined) {
        flag(
          contract,
          '<spec-contract compatibility-scope="…"> with no compatibility= is incoherent',
          'A scope only makes sense once a compatibility direction has been claimed — add compatibility= naming the direction, or drop compatibility-scope= (spec 077-event-schema-evolution, D-001).',
        );
      }
    }

    return findings;
  },
};
