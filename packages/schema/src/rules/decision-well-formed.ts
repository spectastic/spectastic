import type { Element } from '../parser.js';
import { findAll, getAttr, getLocation } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';

/**
 * `decision-well-formed` (spec 112-guardrail-decision-record, FR-002/FR-005).
 *
 * Slice 1 of the architectural-guardrails design brief promotes the
 * prose-and-hand-typed-id decision convention (dogfooded as `D-008` ↔
 * `NoWallClockRule` in `spec-tictactoe-2`) into a structured record a retrieval
 * and a gate can operate on. This rule enforces the shape of that record:
 *
 *  - `status` (if present) is one of {proposed, accepted, superseded, retired};
 *    `posture` (if present) is one of {warn, block}.
 *  - An `accepted` decision whose posture is not warn-only must declare a
 *    `<spec-scope>` with at least one `<spec-path>` — a governing decision the
 *    tooling cannot scope to any code is not enforceable.
 *  - A present `<spec-enforcement>` must be either "≥1 `<spec-rule>` carrying a
 *    `tool` and an `id`" or "exactly one `<spec-none>` carrying a non-empty
 *    `reason`". Absent enforcement is NOT this rule's concern — coverage is a
 *    later slice; this rule only validates the SHAPE of enforcement when
 *    declared.
 *  - FR-005: two ACTIVE (status=accepted) decisions whose scopes share an
 *    identical path, with no `supersedes` relation between them, are reported
 *    so precedence is always explicit rather than silently picked.
 *
 * Every problem is reported granularly (one finding per problem), mirroring
 * `slo-well-formed` and `no-executable-content`.
 *
 * Pure: parser + policy sets only. No fs, no clock, no network, no model
 * client (NFR-001) — asserted by `decision-well-formed.no-network.test.ts`.
 */

const VALID_STATUS = new Set(['proposed', 'accepted', 'superseded', 'retired']);
const VALID_POSTURE = new Set(['warn', 'block']);

/** Collect an element's visible text, collapsed (mirrors slo-well-formed's textOf). */
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

/** The non-empty path globs declared under a decision's <spec-scope>. */
function scopePaths(decision: Element): string[] {
  return findAll(decision, 'spec-path')
    .map((p) => textOf(p))
    .filter((s) => s.length > 0);
}

export const decisionWellFormedRule: PerFileRule = {
  id: 'decision-well-formed',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    '<spec-decision> governance metadata must be well-formed: legal status/posture, a scope on an enforced accepted decision, a rule-or-none enforcement shape, and no unexplained overlap between active decisions.',
  check({ doc }) {
    const findings: Finding[] = [];
    const decisions = findAll(doc.ast, 'spec-decision');
    if (decisions.length === 0) return findings; // absence is never a finding

    const flag = (el: Element, message: string, fixHint: string): void => {
      const loc = getLocation(el);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'decision-well-formed',
        severity: 'error',
        message,
        fixHint,
      });
    };

    // For the overlap check (FR-005): active decisions with their paths + supersedes.
    const active: { id: string; paths: Set<string>; supersedes: string | undefined; el: Element }[] = [];

    for (const d of decisions) {
      const id = getAttr(d, 'id') ?? '?';
      const status = getAttr(d, 'status');
      const posture = getAttr(d, 'posture');

      if (status !== undefined && !VALID_STATUS.has(status)) {
        flag(
          d,
          `<spec-decision id="${id}"> has an illegal status="${status}"`,
          'Use one of: proposed, accepted, superseded, retired.',
        );
      }
      if (posture !== undefined && !VALID_POSTURE.has(posture)) {
        flag(
          d,
          `<spec-decision id="${id}"> has an illegal posture="${posture}"`,
          'Use warn or block — or omit posture to inherit the profile default (block at standard+).',
        );
      }

      const paths = scopePaths(d);
      // Scope required once accepted and not warn-only. Omitted posture ⇒ block.
      if (status === 'accepted' && posture !== 'warn' && paths.length === 0) {
        flag(
          d,
          `<spec-decision id="${id}"> is accepted and enforced but declares no <spec-scope> with a <spec-path>`,
          'Add <spec-scope><spec-path>…glob…</spec-path></spec-scope> so the decision can be scoped to the code it governs, or set posture="warn".',
        );
      }

      // Enforcement shape — only when a <spec-enforcement> is present.
      for (const enf of findAll(d, 'spec-enforcement')) {
        const rules = findAll(enf, 'spec-rule').filter(
          (r) => (getAttr(r, 'tool') ?? '').trim() !== '' && (getAttr(r, 'id') ?? '').trim() !== '',
        );
        const nones = findAll(enf, 'spec-none');
        const nonesMissingReason = nones.filter((n) => (getAttr(n, 'reason') ?? '').trim() === '');
        for (const n of nonesMissingReason) {
          flag(
            n,
            `<spec-decision id="${id}"> has a <spec-none> enforcement with no reason=`,
            'Add reason="…" explaining why this decision has no executable check (e.g. "enforced operationally by a DB grant").',
          );
        }
        const hasValidNone = nones.length - nonesMissingReason.length > 0;
        if (rules.length === 0 && nones.length === 0) {
          flag(
            enf,
            `<spec-decision id="${id}"> has a <spec-enforcement> that is neither a <spec-rule tool= id=> nor a <spec-none reason=>`,
            'Name at least one <spec-rule tool="…" id="…"/>, or exactly one <spec-none reason="…"/>.',
          );
        }
        void hasValidNone;
      }

      if (status === 'accepted') {
        active.push({ id, paths: new Set(paths), supersedes: getAttr(d, 'supersedes'), el: d });
      }
    }

    // FR-005 overlap: one finding per unordered pair sharing a path with no supersede link.
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i]!;
        const b = active[j]!;
        if (a.supersedes === b.id || b.supersedes === a.id) continue;
        const shared = [...a.paths].filter((p) => b.paths.has(p));
        if (shared.length === 0) continue;
        flag(
          a.el,
          `<spec-decision id="${a.id}"> and <spec-decision id="${b.id}"> both govern "${shared[0]}" with no supersedes between them — precedence is ambiguous (overlap)`,
          `Make one supersede the other (supersedes="${b.id}"), or narrow their scopes so they do not overlap.`,
        );
      }
    }

    return findings;
  },
};
