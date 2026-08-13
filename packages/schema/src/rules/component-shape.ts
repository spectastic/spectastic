import { findAll } from '../parser.js';
import { readComponents } from '../component.js';
import type { Finding, PerFileRule } from '../types.js';
import { COMPONENT_ELEMENT, COMPONENT_MATURITIES, COMPONENT_ORIGINS, COMPONENT_SCOPES } from '../visual-vocabulary.js';

/**
 * `component-shape` (spec 097, FR-001/FR-005/FR-006/FR-011).
 *
 * The three properties are checked INDEPENDENTLY and reported separately, so a
 * component with a wrong scope and a wrong origin produces two findings naming
 * both rather than one saying "malformed". They are independent in the data
 * model and must be independent in the diagnostics too.
 *
 * The maturity check is the one carrying FR-005's weight. That requirement is
 * violated not by someone announcing a new taxonomy but by quietly accepting
 * "stable" as a synonym for accepted, because it reads better to a
 * design-system audience. So the recognised list IS the project's status set,
 * and a test pins the two together.
 *
 * Never fires on a document with no components: an empty set is not a gap
 * (FR-010), which is the lesson from 77 gap rows nobody could answer.
 */

export const componentShapeRule: PerFileRule = {
  id: 'component-shape',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    'A <spec-component> must carry a name and a recognised scope, origin and maturity, drawn from the vocabularies this project already uses.',
  check({ doc }) {
    const findings: Finding[] = [];
    if (findAll(doc.ast, COMPONENT_ELEMENT).length === 0) return findings;

    const flag = (
      at: { line: number; column: number },
      message: string,
      fixHint: string,
      severity: 'error' | 'warning' = 'error',
    ): void => {
      findings.push({
        file: doc.file,
        line: at.line,
        column: at.column,
        rule: 'component-shape',
        severity,
        message,
        fixHint,
      });
    };

    for (const component of readComponents(doc)) {
      const named = component.name ?? '(unnamed)';

      if (component.name === undefined || component.name === '') {
        flag(
          component,
          '<spec-component> is missing required name=',
          'Name the component (spec.html FR-001) — a wrapper and a use both reference it by name, so an unnamed one cannot be referred to.',
        );
      }

      if (component.scope === undefined || !COMPONENT_SCOPES.includes(component.scope as never)) {
        flag(
          component,
          `<spec-component name="${named}"> has scope="${component.scope ?? ''}", which is not recognised`,
          `Use ${COMPONENT_SCOPES.join(' or ')} (spec.html FR-001). Scope is deliberately binary: a component two features share sits at feature scope and records both in used-by, because nothing could decide when a third value becomes project.`,
        );
      }

      if (component.origin === undefined || !COMPONENT_ORIGINS.includes(component.origin as never)) {
        flag(
          component,
          `<spec-component name="${named}"> has origin="${component.origin ?? ''}", which is not recognised`,
          `Use one of ${COMPONENT_ORIGINS.join(', ')} (spec.html FR-006).`,
        );
      }

      if (component.maturity === undefined || !COMPONENT_MATURITIES.includes(component.maturity as never)) {
        flag(
          component,
          `<spec-component name="${named}"> has maturity="${component.maturity ?? ''}", which is not one of this project's status values`,
          `Use one of ${COMPONENT_MATURITIES.join(', ')} (spec.html FR-005). The familiar ladder maps onto these — experimental is draft, stable is accepted — and a synonym would be exactly the parallel vocabulary the requirement forbids.`,
        );
      }

      if (component.maturity === 'deprecated' && (component.replacedBy === undefined || component.replacedBy === '')) {
        flag(
          component,
          `<spec-component name="${named}"> is deprecated and names no replacement`,
          'Add replaced-by= naming what to use instead (spec.html FR-011). Deprecating without a destination leaves a reader knowing only that they are wrong.',
          'warning',
        );
      }
    }

    return findings;
  },
};
