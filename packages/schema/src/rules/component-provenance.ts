import { findAll } from '../parser.js';
import { readComponents } from '../component.js';
import type { Finding, PerFileRule } from '../types.js';
import { COMPONENT_ELEMENT } from '../visual-vocabulary.js';

/**
 * `component-provenance` (spec 097, FR-007/FR-008/FR-009, design D-001/D-005).
 *
 * Copying a component into a repository is a licensing event as much as an
 * engineering one, and nothing in design tooling records it. The field set here
 * is the knowledge corpus's, because taking a component in is the same act as
 * taking a document in — and so is the severity split: a reference to something
 * SUPERSEDED warns, a reference that resolves to NOTHING errors. Being behind
 * upstream should nag; pointing at nothing should fail.
 *
 * Nothing in this module fetches anything. "Unresolvable" means the referenced
 * component is not declared in this project — not that a URL was unreachable.
 * `origin-url` is provenance a human reads, consistent with P-11, and a test
 * asserts no network surface exists here at all.
 */

const REQUIRED_VENDORED: readonly (readonly [keyof ReturnType<typeof readComponents>[number], string])[] = [
  ['originUrl', 'origin-url'],
  ['edition', 'edition'],
  ['license', 'license'],
];

export const componentProvenanceRule: PerFileRule = {
  id: 'component-provenance',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    'A vendored <spec-component> must record where it came from, and a wrapper must reference what it wraps rather than copy its provenance.',
  check({ doc }) {
    const findings: Finding[] = [];
    if (findAll(doc.ast, COMPONENT_ELEMENT).length === 0) return findings;

    const components = readComponents(doc);
    const byName = new Map(components.filter((c) => c.name !== undefined).map((c) => [c.name as string, c]));

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
        rule: 'component-provenance',
        severity,
        message,
        fixHint,
      });
    };

    for (const component of components) {
      const named = component.name ?? '(unnamed)';

      // FR-008 — a vendored component records where it came from.
      if (component.origin === 'vendored') {
        for (const [field, attr] of REQUIRED_VENDORED) {
          const value = component[field];
          if (value === undefined || value === '') {
            flag(
              component,
              `<spec-component name="${named}" origin="vendored"> is missing ${attr}=`,
              `Record where this component came from (spec.html FR-008). Copying a component in is a licensing event as much as an engineering one, and ${attr} is part of what makes that reviewable later.`,
            );
          }
        }
      }

      if (component.wraps === undefined || component.wraps === '') continue;

      // FR-007 / D-001 — a wrapper REFERENCES, and must not also copy.
      const copied = REQUIRED_VENDORED.filter(([field]) => component[field] !== undefined && component[field] !== '');
      if (copied.length > 0) {
        flag(
          component,
          `<spec-component name="${named}" wraps="${component.wraps}"> copies provenance it should read through the reference`,
          `Remove ${copied.map(([, a]) => a).join(', ')} and let the wrapped component hold it (spec.html FR-007). Two records of a licence will diverge, and a diverged licence record is worse than none because it looks authoritative.`,
        );
      }

      const wrapped = byName.get(component.wraps);

      // FR-009 — the severity split.
      if (wrapped === undefined) {
        flag(
          component,
          `<spec-component name="${named}"> wraps "${component.wraps}", which this project does not declare`,
          'A wrapper reads its origin through the reference, so a reference to nothing records nothing at all (spec.html FR-009). Declare the wrapped component, or correct the name.',
        );
        continue;
      }

      if (wrapped.maturity === 'superseded' || wrapped.maturity === 'deprecated') {
        flag(
          component,
          `<spec-component name="${named}"> wraps "${component.wraps}", which is ${wrapped.maturity}`,
          `Move to ${wrapped.replacedBy ?? 'its replacement'} when you can (spec.html FR-009). Being behind upstream nags rather than fails — the reference still resolves, so nothing is broken today.`,
          'warning',
        );
      }
    }

    return findings;
  },
};
