import type { Element } from '../parser.js';
import { findAll, getAttr, getLocation } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';
import { RECOGNISED_STATE_SOURCES, SOURCES_REQUIRING_ORIGIN, STATE_ELEMENT } from '../visual-vocabulary.js';

/**
 * `state-source-required` (spec 095, FR-002/FR-003/FR-004).
 *
 * Every state records where it came from, because a derived state and an
 * authored one are different claims. A derived state is owed by the contract
 * and could in principle be checked against it; an authored one exists because
 * somebody thought of it, and nothing can tell whether the thinking was
 * complete.
 *
 * A many-to-one collapse is recorded by `from` carrying more than one value.
 * That is deliberate (design D-002): the collapse and the origin are the same
 * field, so the collapse cannot be forgotten separately from the origin.
 *
 * DELIBERATELY does not check coverage. Nothing in this codebase parses a
 * contract file's responses — `readContractDeclarations` stops at the
 * declaration — so this rule checks that each state SAYS where it came from,
 * and never implies that none was forgotten (design D-006). The finding copy
 * avoids "complete" for that reason, and a test asserts it.
 */

export const stateSourceRequiredRule: PerFileRule = {
  id: 'state-source-required',
  scope: 'per-file',
  defaultSeverity: 'error',
  description: 'A <spec-state> must carry a recognised source=, and one derived from something must name it in from=.',
  check({ doc }) {
    const findings: Finding[] = [];
    const states = findAll(doc.ast, STATE_ELEMENT);
    if (states.length === 0) return findings;

    const flag = (el: Element, message: string, fixHint: string): void => {
      const loc = getLocation(el);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'state-source-required',
        severity: 'error',
        message,
        fixHint,
      });
    };

    for (const state of states) {
      const id = getAttr(state, 'id') ?? '(unnamed)';
      const source = getAttr(state, 'source');
      const from = getAttr(state, 'from');

      if (source === undefined || source === '') {
        flag(
          state,
          `<spec-state id="${id}"> is missing required source=`,
          `Set source= to one of ${RECOGNISED_STATE_SOURCES.join(', ')} (spec.html FR-002). A state the contract owes you and a state somebody thought of are different claims, and only one of them can be traced back.`,
        );
        continue;
      }

      if (!RECOGNISED_STATE_SOURCES.includes(source as (typeof RECOGNISED_STATE_SOURCES)[number])) {
        flag(
          state,
          `<spec-state source="${source}"> is not a recognised source`,
          `Use one of ${RECOGNISED_STATE_SOURCES.join(', ')} (spec.html FR-002) — an unrecognised token is rejected loudly rather than silently accepted.`,
        );
        continue;
      }

      const needsOrigin = SOURCES_REQUIRING_ORIGIN.includes(source as (typeof SOURCES_REQUIRING_ORIGIN)[number]);

      if (needsOrigin && (from === undefined || from.trim() === '')) {
        flag(
          state,
          `<spec-state id="${id}" source="${source}"> is missing from=, so it declares an origin it does not name`,
          'Add from= naming what it came from — a response, or a field (spec.html FR-002). Where several responses collapse into this one state, list them all: that list IS the record of the collapse (FR-003).',
        );
        continue;
      }

      if (!needsOrigin && from !== undefined) {
        flag(
          state,
          `<spec-state id="${id}"> is authored but names an origin in from=`,
          'An authored state exists because somebody thought of it, so it has nothing to point at (spec.html FR-002). Either drop from=, or set source= to derived or field if it does come from the contract.',
        );
      }
    }

    return findings;
  },
};
