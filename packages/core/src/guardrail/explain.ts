import { decisionResourceUri } from '@spectastic/schema/project';
import type { ExplainedViolation, GovernanceDecision, Verdict } from './types.js';

/**
 * Reviewer-grade verdict explanation (spec 118-verdict-explain). Joins each
 * violation to everything a PR author or reviewer needs to act — the offending
 * code shown in context, the governing decision made readable, and the location
 * where the pattern is sanctioned — and renders it in the clarity shape of a
 * `<spec-triage>` card (Offending / Why / Sanctioned path).
 *
 * Every word comes from the decision record or the changed file; the renderer
 * authors none of it (the drift the whole layer avoids). Pure and deterministic:
 * file content arrives via an injected reader, no clock, no model, no network.
 */

export interface ExplainInput {
  verdict: Verdict;
  decisions: readonly GovernanceDecision[];
  project: string;
  /** Reads a changed file's text for the snippet; null if unreadable. */
  readFile: (path: string) => string | null;
  /** Lines of context to show either side of the offending line (default 3). */
  context?: number;
}

/** Render the offending code around `line` (1-based), marking it — or a plain note. */
function snippet(text: string | null, line: number | undefined, ctx: number): string {
  if (text === null) return '(file not on disk — cannot show the offending code; see the location above)';
  const lines = text.split('\n');
  if (line === undefined || line < 1) return lines.slice(0, Math.min(ctx * 2 + 1, lines.length)).join('\n');
  const from = Math.max(1, line - ctx);
  const to = Math.min(lines.length, line + ctx);
  const out: string[] = [];
  for (let n = from; n <= to; n++) {
    const marker = n === line ? '>' : ' ';
    out.push(`  ${marker} ${String(n).padStart(4)}| ${lines[n - 1] ?? ''}`);
  }
  return out.join('\n');
}

export function explainViolations(input: ExplainInput): ExplainedViolation[] {
  const ctx = input.context ?? 3;
  const byKey = new Map<string, GovernanceDecision>();
  for (const d of input.decisions) byKey.set(`${d.specId}/${d.id}`, d);

  return input.verdict.violations.map((v) => {
    const d = byKey.get(`${v.specId}/${v.decisionId}`);
    const rule = d?.enforcement?.rules.find((r) => r.id === v.ruleId);
    const sanctioned = rule?.allowedIn ?? (d?.paths.length ? d.paths.join(', ') : '(no allowed location declared)');
    return {
      violation: v,
      offending: snippet(input.readFile(v.file), v.line, ctx),
      decisionCoordinate: decisionResourceUri(input.project, v.specId, v.decisionId),
      decisionFile: `specs/${v.specId}/design.html#${v.decisionId}`,
      decisionTitle: d?.title ?? `${v.specId}/${v.decisionId}`,
      decisionReason: v.reason || d?.reason || '(no reason recorded)',
      decisionProse: d?.prose ?? '',
      sanctionedPath: sanctioned,
    };
  });
}

/** Render explanations in the triage-card shape: header + Offending / Why / Sanctioned path. */
export function renderExplanations(explained: readonly ExplainedViolation[]): string {
  if (explained.length === 0) return '';
  const blocks = explained.map((e) => {
    const v = e.violation;
    const loc = v.line !== undefined ? `${v.file}:${v.line}` : v.file;
    const why = e.decisionProse ? `${e.decisionReason}\n\n    ${e.decisionProse}` : e.decisionReason;
    return [
      `── ${e.decisionTitle} ──`,
      `  Rule ${v.ruleId} · ${loc}`,
      '',
      '  Offending — the change the gate flagged:',
      e.offending,
      '',
      '  Why it is a violation — the decision that governs this code:',
      `    ${why}`,
      `    Open the full decision: ${e.decisionFile}  (${e.decisionCoordinate})`,
      '',
      '  Sanctioned path — where this pattern is permitted instead:',
      `    ${e.sanctionedPath}`,
    ].join('\n');
  });
  return `Explanation (advisory — the decision and the code, so you can act):\n\n${blocks.join('\n\n')}`;
}
