import { findAll, getAttr, getLocation } from '../parser.js';
import type { Element } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';
import { isGoldenSignal } from '../slo-shared.js';

/**
 * `slo-well-formed` (spec 047-slo-nfr-artifact, FR-002). A `<spec-slo>` with a
 * `target=` present (slo-target-required's concern) must still carry a real
 * OpenSLO shape — the fields the SLO-from-NFR artifact model requires per
 * FR-001: the target resolves to an NFR requirement in the same document, the
 * SLI (element content) is non-empty, and `objective` / `window` /
 * `budgeting` are all present. An optional `signal=` must be one of the Four
 * Golden Signals if given.
 *
 * Every violation is reported granularly (one finding per problem), mirroring
 * `no-executable-content` — a `<spec-slo>` can fail several ways at once and
 * the reviewer should see all of them, not just the first.
 */

const REQUIRED_ATTRS = ['objective', 'window', 'budgeting'] as const;

/** Collect an element's visible text, collapsed (mirrors date-format.ts's textOf). */
function textOf(el: Element): string {
  let out = '';
  const visit = (node: unknown): void => {
    const n = node as { tagName?: string; value?: string; childNodes?: unknown[] };
    if (n.tagName === undefined && typeof n.value === 'string') out += n.value;
    if (n.childNodes) for (const child of n.childNodes) visit(child);
  };
  visit(el);
  return out.replace(/\s+/g, ' ').trim();
}

export const sloWellFormedRule: PerFileRule = {
  id: 'slo-well-formed',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    '<spec-slo> must resolve target= to an NFR in this document, carry an SLI + objective + window + budgeting, and use a recognised signal=.',
  check({ doc }) {
    const findings: Finding[] = [];
    const nfrIds = new Set(
      findAll(doc.ast, 'spec-requirement')
        .map((el) => getAttr(el, 'id'))
        .filter((id): id is string => typeof id === 'string' && id.startsWith('NFR-')),
    );

    const flag = (slo: Element, message: string, fixHint: string): void => {
      const loc = getLocation(slo);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'slo-well-formed',
        severity: 'error',
        message,
        fixHint,
      });
    };

    for (const slo of findAll(doc.ast, 'spec-slo')) {
      const target = getAttr(slo, 'target');
      // A missing target= is slo-target-required's concern — only check
      // resolution when one is present.
      if (target !== undefined && !nfrIds.has(target)) {
        flag(
          slo,
          `<spec-slo target="${target}"> does not resolve to an NFR-* requirement in this document`,
          'Point target= at a <spec-requirement id="NFR-NNN"> in the same document.',
        );
      }

      for (const attr of REQUIRED_ATTRS) {
        const value = getAttr(slo, attr);
        if (!value || value.trim() === '') {
          flag(slo, `<spec-slo> is missing required ${attr}=`, `Add ${attr}="…" — every SLO carries an objective, a window, and a budgeting method.`);
        }
      }

      if (textOf(slo) === '') {
        flag(slo, '<spec-slo> has no SLI — its content is empty', 'Describe what is measured (the SLI) as the element\'s content, e.g. "fraction of requests served < 200 ms".');
      }

      const signal = getAttr(slo, 'signal');
      if (signal !== undefined && !isGoldenSignal(signal)) {
        flag(
          slo,
          `<spec-slo signal="${signal}"> is not a recognised Four Golden Signals value`,
          'Use one of: latency, traffic, errors, saturation — or omit signal= entirely.',
        );
      }
    }
    return findings;
  },
};
