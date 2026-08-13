import { findAll } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';
import { readVariantGrid } from '../variant-grid.js';
import { GRID_ELEMENT } from '../visual-vocabulary.js';

/**
 * `variant-same-resolves` (spec 096, FR-006, design D-004).
 *
 * `<spec-same>` is what gives an absent cell exactly one meaning. An unwritten
 * combination means nobody looked; a written one means somebody looked and
 * found no difference. That distinction only survives if the reference
 * resolves — a same-as naming an axis or context that does not exist reads as
 * diligence and records nothing, which is the worst outcome available to an
 * element whose entire purpose is to make silence unambiguous.
 *
 * So the names are contracts, per P-3, and a rename breaks loudly rather than
 * quietly turning a recorded finding into a dangling one.
 */

export const variantSameResolvesRule: PerFileRule = {
  id: 'variant-same-resolves',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: 'Every axis and context named by a <spec-same> must exist in the declared grid.',
  check({ doc }) {
    const findings: Finding[] = [];
    if (findAll(doc.ast, GRID_ELEMENT).length === 0) return findings;

    const grid = readVariantGrid(doc);
    if (grid.same.length === 0) return findings;

    const contextsByAxis = new Map<string, Set<string>>();
    for (const axis of grid.axes) {
      if (axis.name === undefined) continue;
      contextsByAxis.set(
        axis.name,
        new Set(axis.contexts.map((c) => c.name).filter((n): n is string => n !== undefined)),
      );
    }

    const flag = (at: { line: number; column: number }, message: string, fixHint: string): void => {
      findings.push({
        file: doc.file,
        line: at.line,
        column: at.column,
        rule: 'variant-same-resolves',
        severity: 'error',
        message,
        fixHint,
      });
    };

    for (const same of grid.same) {
      const pairs = Object.entries(same.axes);

      if (pairs.length === 0) {
        flag(
          same,
          '<spec-same> names no combination, so it records having checked nothing',
          'Set axes= to the combination that was examined, as space-separated axis=context pairs (spec.html FR-006) — for example axes="platform=macos mode=dark".',
        );
        continue;
      }

      for (const [axisName, contextName] of pairs) {
        const contexts = contextsByAxis.get(axisName);
        if (contexts === undefined) {
          flag(
            same,
            `<spec-same> names axis "${axisName}", which the grid does not declare`,
            'A recorded combination must refer to axes that exist (spec.html FR-006). A reference to nothing reads as diligence and records nothing at all.',
          );
          continue;
        }
        if (!contexts.has(contextName)) {
          flag(
            same,
            `<spec-same> names context "${contextName}" on axis "${axisName}", which that axis does not declare`,
            'A recorded combination must refer to contexts that exist (spec.html FR-006) — otherwise a renamed context silently turns a finding into a dangling one.',
          );
        }
      }
    }

    return findings;
  },
};
