import { findAll } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';
import { readConsentGates, readTrackingEvents } from '../tracking-plan.js';
import { CONSENT_GATE_ELEMENT, EVENT_ELEMENT } from '../visual-vocabulary.js';

/**
 * `tracking-plan-shape` (spec 104-tracking-plan).
 *
 * Two behaviours here run against this family's usual reading, and both are
 * deliberate rather than drift:
 *
 *  1. An event declaring NO fields is valid and means it carries none. Every
 *     other absence in this vocabulary means "not recorded". An empty payload
 *     is the safest event there is, and a shape that read it as unrecorded
 *     would push an author into inventing a field to look complete.
 *  2. An `answer` of "none" on the consent gate is an ANSWER. A project that
 *     decided to collect nothing has decided, and rendering that identically
 *     to a project that never asked would erase the decision.
 *
 * And one thing this rule must never do, per FR-005: read a declared event as
 * evidence that one ships. The plan is authored before anything is built, and
 * treating it as an emission would let a spec claim a privacy posture the
 * build does not have. A test asserts the absence, because nothing else can.
 */

export const trackingPlanShapeRule: PerFileRule = {
  id: 'tracking-plan-shape',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    'Every declared tracking field must carry a type, and a plan that declares events must reference the consent question that gates it.',
  check({ doc }) {
    const findings: Finding[] = [];
    const events = findAll(doc.ast, EVENT_ELEMENT);
    if (events.length === 0 && findAll(doc.ast, CONSENT_GATE_ELEMENT).length === 0) return findings;

    const flag = (at: { line: number; column: number }, message: string, fixHint: string): void => {
      findings.push({ file: doc.file, line: at.line, column: at.column, rule: 'tracking-plan-shape', severity: 'error', message, fixHint });
    };

    const declared = readTrackingEvents(doc);
    for (const e of declared) {
      const label = e.name === undefined ? '<spec-event>' : `<spec-event name="${e.name}">`;
      if (e.name === undefined || e.name.trim() === '') {
        flag(e, '<spec-event> has no name', 'Add name= — a stable name is what a plan and a build agree on (spec.html FR-001).');
      }
      // NOTE: e.fields.length === 0 is deliberately NOT a finding. See the rule
      // docstring: an empty payload is the safest event there is.
      for (const f of e.fields) {
        if (f.name === undefined || f.name.trim() === '') {
          flag(f, `${label} declares a field with no name`, 'Add name= (spec.html FR-002).');
        }
        if (f.type === undefined || f.type.trim() === '') {
          flag(
            f,
            `${label} declares the field "${f.name ?? ''}" with no type`,
            'Add type= (spec.html FR-002). A typed field is something a privacy reviewer can answer yes or no to; a described one is prose.',
          );
        }
      }
    }

    const gates = readConsentGates(doc);
    if (declared.length > 0 && gates.length === 0) {
      flag(
        declared[0] as { line: number; column: number },
        'This document declares tracking events but references no consent question to gate them',
        'Add a consent gate naming the question that must be answered before anything ships (spec.html FR-004). Authoring a plan early is a design decision; shipping one before the question is answered is a liability, and the gate is what keeps the two apart.',
      );
    }
    for (const g of gates) {
      if (g.question === undefined || g.question.trim() === '') {
        flag(g, '<spec-consent-gate> names no question', 'Add question= referencing the open question this plan waits on (spec.html FR-004).');
      }
    }

    return findings;
  },
};
