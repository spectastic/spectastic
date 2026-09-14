import { findAll, getAttr, parse } from '@spectastic/schema/parser';
import type {
  DecisionPosture,
  DecisionStatus,
  Enforcement,
  EnforcementRule,
  GovernanceDecision,
  ResourceScope,
} from './types.js';

/**
 * Parse the extended `<spec-decision>` records out of a design.html (spec 112
 * Slice 2). The source of truth for a decision is the design that authored it;
 * retrieval reads these directly (the decision index/registry is a separate,
 * later distribution concern). Pure — no fs, no clock, no network.
 *
 * Tolerant by design: a malformed decision is `decision-well-formed`'s concern
 * (Slice 1), not this reader's. Here we extract what is present and leave shape
 * validation to the rule, so retrieval never throws on a half-authored card.
 */

const STATUSES = new Set<DecisionStatus>(['proposed', 'accepted', 'superseded', 'retired']);
const POSTURES = new Set<DecisionPosture>(['warn', 'block']);

function textOf(el: { childNodes?: unknown[]; value?: string; tagName?: string }): string {
  let out = '';
  const visit = (node: unknown): void => {
    const n = node as { tagName?: string; value?: string; childNodes?: unknown[] };
    if (n.tagName === undefined && typeof n.value === 'string') out += n.value;
    if (n.childNodes) for (const child of n.childNodes) visit(child);
  };
  visit(el);
  return out.replace(/\s+/g, ' ').trim();
}

export function parseDecisions(html: string, specId: string, file = `${specId}/design.html`): GovernanceDecision[] {
  const doc = parse(html, file);
  const out: GovernanceDecision[] = [];

  for (const el of findAll(doc.ast, 'spec-decision')) {
    const id = getAttr(el, 'id');
    if (!id) continue; // a decision with no id is not addressable; skip (rule flags it elsewhere)

    const rawStatus = getAttr(el, 'status');
    const rawPosture = getAttr(el, 'posture');

    const paths: string[] = [];
    const modules: string[] = [];
    let resource: ResourceScope | undefined;
    for (const scope of findAll(el, 'spec-scope')) {
      for (const p of findAll(scope, 'spec-path')) {
        const t = textOf(p);
        if (t) paths.push(t);
      }
      for (const m of findAll(scope, 'spec-module')) {
        const t = textOf(m);
        if (t) modules.push(t);
      }
      // A data-resource scope (spec 119): coordinate + owner (+ optional allowed-in).
      // Tolerant like the rest of this reader — a malformed one is the
      // `resource-scope-well-formed` rule's concern, not this parser's.
      const res = findAll(scope, 'spec-resource')[0];
      if (res && resource === undefined) {
        const coordinate = getAttr(res, 'coordinate') ?? '';
        const owner = getAttr(res, 'owner') ?? '';
        const allowedIn = getAttr(res, 'allowed-in');
        if (coordinate || owner) {
          resource = { coordinate, owner, ...(allowedIn !== undefined ? { allowedIn } : {}) };
        }
      }
    }

    let enforcement: Enforcement | undefined;
    const enfEls = findAll(el, 'spec-enforcement');
    if (enfEls.length > 0) {
      const rules = enfEls
        .flatMap((enf) => findAll(enf, 'spec-rule'))
        .map((r) => ({
          tool: getAttr(r, 'tool') ?? '',
          id: getAttr(r, 'id') ?? '',
          run: getAttr(r, 'run'),
          pattern: getAttr(r, 'pattern'),
          deny: getAttr(r, 'deny'),
          allowedIn: getAttr(r, 'allowed-in'),
        }))
        .filter((r) => r.tool !== '' && r.id !== '')
        .map((r) => {
          const rule: EnforcementRule = { tool: r.tool, id: r.id };
          if (r.run !== undefined) rule.run = r.run;
          if (r.pattern !== undefined) rule.pattern = r.pattern;
          if (r.deny !== undefined) rule.deny = r.deny;
          if (r.allowedIn !== undefined) rule.allowedIn = r.allowedIn;
          return rule;
        });
      const noneEl = enfEls
        .flatMap((enf) => findAll(enf, 'spec-none'))
        .find((n) => (getAttr(n, 'reason') ?? '') !== '');
      enforcement = { rules };
      if (noneEl) enforcement.none = { reason: getAttr(noneEl, 'reason') ?? '' };
    }

    const reasonEl = findAll(el, 'spec-reason')[0];
    const titleEl = findAll(el, 'h4')[0];
    // The ADR body — the <p> elements directly carrying Context/Decision/Consequences.
    const proseText = findAll(el, 'p')
      .map((p) => textOf(p))
      .filter((t) => t.length > 0)
      .join(' ');

    const decision: GovernanceDecision = {
      id,
      specId,
      paths,
      modules,
    };
    if (rawStatus !== undefined && STATUSES.has(rawStatus as DecisionStatus)) {
      decision.status = rawStatus as DecisionStatus;
    }
    if (rawPosture !== undefined && POSTURES.has(rawPosture as DecisionPosture)) {
      decision.posture = rawPosture as DecisionPosture;
    }
    const supersedes = getAttr(el, 'supersedes');
    if (supersedes) decision.supersedes = supersedes;
    const reviewBy = getAttr(el, 'review-by');
    if (reviewBy) decision.reviewBy = reviewBy;
    if (reasonEl) {
      const r = textOf(reasonEl);
      if (r) decision.reason = r;
    }
    if (titleEl) {
      const t = textOf(titleEl);
      if (t) decision.title = t;
    }
    if (proseText) decision.prose = proseText;
    if (enforcement) decision.enforcement = enforcement;
    if (resource) decision.resource = resource;

    out.push(decision);
  }

  return out;
}
