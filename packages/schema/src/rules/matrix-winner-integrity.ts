import { findAll, getAttr, getLocation } from '../parser.js';
import type { Element } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';

/**
 * `matrix-winner-integrity` (spec 050-stack-selection, FR-010 / D-002). A
 * `<spec-matrix>`'s crowned `data-winner` row is supposed to be the option
 * that was actually chosen — but nothing previously checked that its Total
 * was the top score. The highlight (CSS) is bound to the *choice*, not the
 * *score*, so a matrix could crown a loser and nothing would catch it. This
 * rule is the guarantee half of the fix (the interview markdown, advisory
 * per D-001, is the nudge half).
 *
 * Flags a `data-winner` row whose Total is strictly below another row's.
 * Ties at the top are legal — three plans already in this repo rely on it
 * (the backward-compat spike behind D-002 found 0 winner-below-max cases and
 * 3 ties-at-top across 43 existing matrices). A matrix is skipped entirely
 * if any Total isn't a plain number (an unfilled template placeholder like
 * `[T]`, or any other non-numeric content) — "not yet scored" must never
 * false-fire.
 *
 * Mirrors `slo-well-formed.ts`'s shape: `findAll`/`getAttr`/`getLocation`,
 * early-return on the common case (no `<spec-matrix>` at all) before doing
 * any real work.
 *
 * Also carries the FR-009 target-link check: an optional `target=` on
 * `<spec-matrix>` (mirroring `<spec-risk target>` / `<spec-slo target>`)
 * must resolve to a `<spec-decision id=…>` in the same document when
 * present. Absent `target=` is not an error — the attribute is a SHOULD,
 * not a MUST (FR-009), so most matrices carry none.
 */

/** Collect an element's visible text, collapsed (mirrors slo-well-formed.ts's textOf). */
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

/** Parse a `.score` cell's text as a plain finite number, or `undefined` if it isn't one. */
function parseScore(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '' || !/^-?\d+(\.\d+)?$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

interface Row {
  el: Element;
  isWinner: boolean;
  score: number | undefined;
}

/** Read a matrix's `<tbody>` rows as { element, data-winner?, parsed .score }. */
function readRows(matrix: Element): Row[] {
  const rows: Row[] = [];
  for (const tr of findAll(matrix, 'tr')) {
    const cells = findAll(tr, 'td');
    if (cells.length === 0) continue; // header row (th, not td)
    const scoreCell = cells.find((td) => getAttr(td, 'class')?.split(/\s+/).includes('score'));
    if (!scoreCell) continue;
    rows.push({
      el: tr,
      isWinner: getAttr(tr, 'data-winner') !== undefined,
      score: parseScore(textOf(scoreCell)),
    });
  }
  return rows;
}

export const matrixWinnerIntegrityRule: PerFileRule = {
  id: 'matrix-winner-integrity',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    'A <spec-matrix> data-winner row must not score strictly below another row — the crowned option must be at least tied for the top Total.',
  check({ doc }) {
    const findings: Finding[] = [];
    // The common case is a document with no <spec-matrix> — return before
    // walking rows (the validate-full-project bench floor slo-well-formed
    // already observes).
    const matrices = findAll(doc.ast, 'spec-matrix');
    if (matrices.length === 0) return findings;

    const decisionIds = new Set(
      findAll(doc.ast, 'spec-decision')
        .map((el) => getAttr(el, 'id'))
        .filter((id): id is string => typeof id === 'string' && id !== ''),
    );

    for (const matrix of matrices) {
      const target = getAttr(matrix, 'target');
      if (target !== undefined && !decisionIds.has(target)) {
        const loc = getLocation(matrix);
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'matrix-winner-integrity',
          severity: 'error',
          message: `<spec-matrix target="${target}"> does not resolve to a <spec-decision id="${target}"> in this document`,
          fixHint: 'Point target= at a <spec-decision id="D-NNN"> in the same document, or remove target= if this matrix is standalone.',
        });
      }

      const rows = readRows(matrix);
      if (rows.length === 0) continue;

      // Skip entirely if any row's score isn't a plain number — an unfilled
      // template (`[N]`/`[T]`) or any other non-numeric content means the
      // matrix isn't scored yet, and "not yet scored" must never false-fire.
      const scores = rows.map((r) => r.score);
      if (scores.some((s) => s === undefined)) continue;
      const numericScores = scores as number[];

      const winner = rows.find((r) => r.isWinner);
      if (!winner || winner.score === undefined) continue; // no data-winner row — not this rule's concern

      const max = Math.max(...numericScores);
      if (winner.score < max) {
        const loc = getLocation(winner.el);
        findings.push({
          file: doc.file,
          line: loc.line,
          column: loc.column,
          rule: 'matrix-winner-integrity',
          severity: 'error',
          message: `<spec-matrix> data-winner row scores ${winner.score}, below another row's ${max}`,
          fixHint:
            'The crowned option must be at least tied for the top Total — either move data-winner to the top-scoring row, or re-score the matrix so the chosen option actually wins.',
        });
      }
    }
    return findings;
  },
};
