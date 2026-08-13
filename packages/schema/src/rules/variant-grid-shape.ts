import { findAll } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';
import { readVariantGrid } from '../variant-grid.js';
import { GRID_ELEMENT, NEVER_VERIFIED, RECOGNISED_AXIS_SELECTS } from '../visual-vocabulary.js';

/**
 * `variant-grid-shape` (spec 096, FR-001..FR-005).
 *
 * One rule carrying the obligations an axis, a context and a baseline each
 * have, reported granularly so a finding names which was missed rather than
 * saying "malformed grid".
 *
 * What it deliberately does NOT do is check completeness. There is no notion of
 * a required combination and no coverage number, because a coverage figure over
 * a combinatorial grid recreates the 77 unanswerable gap rows the observables
 * trace already produced in this repository (design D-001). A three-by-three
 * grid with one problem reports one finding, and a test asserts it.
 */

export const variantGridShapeRule: PerFileRule = {
  id: 'variant-grid-shape',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    'A <spec-variant-grid> must declare named axes with a default among their own contexts; a declined context must give a reason; a baseline must state what it was designed and verified against.',
  check({ doc }) {
    const findings: Finding[] = [];
    if (findAll(doc.ast, GRID_ELEMENT).length === 0) return findings;

    const flag = (at: { line: number; column: number }, message: string, fixHint: string): void => {
      findings.push({
        file: doc.file,
        line: at.line,
        column: at.column,
        rule: 'variant-grid-shape',
        severity: 'error',
        message,
        fixHint,
      });
    };

    const grid = readVariantGrid(doc);

    for (const axis of grid.axes) {
      if (axis.name === undefined || axis.name === '') {
        flag(
          axis,
          '<spec-axis> is missing required name=',
          'Name the dimension this axis varies across (spec.html FR-001) — a recorded combination references it by name, so an unnamed axis cannot be referred to.',
        );
        continue;
      }

      if (axis.selects !== undefined && !RECOGNISED_AXIS_SELECTS.includes(axis.selects as never)) {
        flag(
          axis,
          `<spec-axis selects="${axis.selects}"> is not a recognised selection`,
          `Use one of ${RECOGNISED_AXIS_SELECTS.join(', ')} (spec.html FR-002). An axis restricted to values could describe the colours of a television interface and nothing about how it is operated.`,
        );
      }

      for (const context of axis.contexts) {
        if (context.name === undefined || context.name === '') {
          flag(
            context,
            `<spec-context> in axis "${axis.name}" is missing required name=`,
            'Name the context (spec.html FR-001).',
          );
          continue;
        }

        if (context.declined && context.reason === '') {
          flag(
            context,
            `<spec-context name="${context.name}" declined> gives no reason`,
            "Say why this context is not supported, as the element's content (spec.html FR-003). A bare flag is the failure the requirement exists to prevent: a decline without a reason is indistinguishable from an oversight.",
          );
        }

        const baseline = context.baseline;
        if (baseline === undefined) continue;

        if (baseline.designed === undefined || baseline.designed === '') {
          flag(
            baseline,
            `<spec-baseline> in context "${context.name}" is missing required designed=`,
            'Record what this context was designed against (spec.html FR-004) — a platform can restyle every application on it in one release, and nothing in the project causes it.',
          );
        }

        if (baseline.verified === undefined || baseline.verified === '') {
          flag(
            baseline,
            `<spec-baseline> in context "${context.name}" is missing required verified=`,
            `Record what it was last verified against, or "${NEVER_VERIFIED}" if it never has been (spec.html FR-005). Never-verified is a value, so that the gap is visible instead of absent.`,
          );
        }
      }

      // Checked after the contexts, so a default naming a context that failed
      // its own check is not reported twice.
      if (axis.default !== undefined && !axis.contexts.some((c) => c.name === axis.default)) {
        flag(
          axis,
          `<spec-axis name="${axis.name}" default="${axis.default}"> names no context it declares`,
          "The default must be one of this axis's own contexts (spec.html FR-001).",
        );
      }
    }

    return findings;
  },
};
