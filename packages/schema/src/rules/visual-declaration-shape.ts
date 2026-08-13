import type { Element } from '../parser.js';
import { findAll, getAttr, getLocation } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';
import { RECOGNISED_VISUAL_SHAPES } from '../visual-shared.js';

/**
 * `visual-declaration-shape` (spec 093-design-visual-section, FR-009). A
 * `<spec-visual>` declares whether a feature has a visual surface and, where it
 * does, where the token set and screens live — see spec.html FR-005/FR-006/
 * FR-007. Cloned from `contract-declaration-shape`, whose scope discipline is
 * the point: this rule fires only on a PRESENT declaration that is malformed:
 *
 *  - `shape=` is missing or is not one of the two recognised tokens.
 *  - `shape="screens"` carries no `tokens=`, no `screens=`, or no `source=`.
 *  - `tokens-external=` is present with no `tokens=` — incoherent, since an
 *    external base only means something as the thing a local path extends.
 *  - `shape="none"` nonetheless names a path — a declaration that says the
 *    feature has no surface and then points at one.
 *
 * It never fires on a document with no `<spec-visual>` at all, which is every
 * design in the estate today and every design in a project with no user
 * interface tomorrow. Whether a section is present *when it should not be* is a
 * different question with a different answer: it depends on filesystem state
 * the rule engine cannot read, so it is a scan in `@spectastic/core`, not a
 * rule here.
 *
 * Every violation is reported granularly, mirroring `slo-well-formed`.
 */

export const visualDeclarationShapeRule: PerFileRule = {
  id: 'visual-declaration-shape',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    '<spec-visual> must carry a recognised shape=, and a declared surface must name its token set, its screens and its source.',
  check({ doc }) {
    const findings: Finding[] = [];
    // The common case is a document with no <spec-visual> — return before any
    // further work, so a declaration-less doc costs one cheap findAll.
    const visuals = findAll(doc.ast, 'spec-visual');
    if (visuals.length === 0) return findings;

    const flag = (el: Element, message: string, fixHint: string): void => {
      const loc = getLocation(el);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'visual-declaration-shape',
        severity: 'error',
        message,
        fixHint,
      });
    };

    for (const visual of visuals) {
      const shape = getAttr(visual, 'shape');
      const tokens = getAttr(visual, 'tokens');
      const tokensExternal = getAttr(visual, 'tokens-external');
      const screens = getAttr(visual, 'screens');
      const source = getAttr(visual, 'source');
      const variants = getAttr(visual, 'variants');
      const contexts = getAttr(visual, 'contexts');

      if (shape === undefined || shape === '') {
        flag(
          visual,
          '<spec-visual> is missing required shape=',
          'Set shape= to screens or none (spec.html FR-007). A feature inside an interface project that touches no screen declares none rather than omitting the element.',
        );
        continue; // an absent shape can't also be checked against its paths
      }

      if (!RECOGNISED_VISUAL_SHAPES.includes(shape as (typeof RECOGNISED_VISUAL_SHAPES)[number])) {
        flag(
          visual,
          `<spec-visual shape="${shape}"> is not a recognised shape`,
          'Use screens or none (spec.html FR-007) — an unrecognised token is rejected loudly rather than silently accepted.',
        );
        continue;
      }

      if (shape === 'none') {
        // A declaration that says there is no surface and then points at one is
        // two claims that cannot both be true; report it once, not per attribute.
        if (
          tokens !== undefined ||
          screens !== undefined ||
          tokensExternal !== undefined ||
          variants !== undefined ||
          contexts !== undefined
        ) {
          flag(
            visual,
            '<spec-visual shape="none"> declares no surface but names a path',
            'Drop tokens=/screens=/tokens-external=/variants=/contexts=, or change shape= to screens (spec.html FR-007) — an explicit none carries no paths and addresses no contexts.',
          );
        }
        continue;
      }

      if (tokens === undefined) {
        flag(
          visual,
          '<spec-visual shape="screens"> declares a surface with no tokens=',
          "Add tokens= naming the project-relative location of the project's token set (spec.html FR-005). It may name a directory as well as a file.",
        );
      }

      // A coverage claim needs something to be a claim ABOUT. Deliberately NOT
      // symmetric with an absent variants=, which is silence: nothing obliges a
      // project to have a grid (093 FR-005 makes naming one a capability, not
      // an obligation), but naming contexts on a grid nobody declared is a
      // claim about nothing — the same incoherence tokens-external= without
      // tokens= carries, and reported the same way.
      if (contexts !== undefined && variants === undefined) {
        flag(
          visual,
          '<spec-visual> claims contexts= with no variants= to claim them against',
          "Add variants= naming the project's variant grid, or drop contexts= (spec.html FR-012). A coverage claim only means something against a declared grid.",
        );
      }

      if (screens === undefined) {
        flag(
          visual,
          '<spec-visual shape="screens"> declares a surface with no screens=',
          "Add screens= naming the project-relative location of this feature's screens (spec.html FR-005).",
        );
      }

      if (source === undefined) {
        flag(
          visual,
          '<spec-visual shape="screens"> declares a surface with no source=',
          'Add source= recording where the design came from (spec.html FR-006). It is provenance for a reader, never resolved — a surface built by hand records that rather than leaving it blank.',
        );
      }

      // Checked independently of the three above, so a missing tokens= reports
      // as its own finding rather than being masked by this one.
      if (tokensExternal !== undefined && tokens === undefined) {
        flag(
          visual,
          '<spec-visual tokens-external="…"> with no tokens= is incoherent',
          'An external base only means something as the thing a local path extends — add tokens= naming the overrides, or drop tokens-external= (spec.html FR-005).',
        );
      }
    }

    return findings;
  },
};
