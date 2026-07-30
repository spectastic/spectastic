/**
 * Render the split proposal into a `<spec-split>` section and append it to the
 * parent (spec 029, plan D-005 / FR-001 / NFR-002). Static HTML — children,
 * coverage table, and verdict all read with JS off; only the embedded
 * `<spec-rice>` gauges are JS-decorated. The append is additive: it inserts the
 * section before `</main>` and touches nothing else.
 */

import type { CandidateChild, CoverageReport, SplitModel } from './types.js';

function esc(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function childBlock(c: CandidateChild, rank: number): string {
  const r = c.rice;
  const after = c.dependsOn.length > 0 ? ` · after ${c.dependsOn.map(esc).join(', ')}` : '';
  const covers = c.assignedRequirementIds.length > 0 ? c.assignedRequirementIds.map(esc).join(', ') : '—';
  const provisional = c.riceConfirmed ? '' : ' <small><em>(RICE provisional)</em></small>';
  return `    <li data-child="${esc(c.specId)}" id="${esc(c.specId)}">
      <strong>${rank}. ${esc(c.title)}</strong> <span class="path">${esc(c.specId)}</span>
      <p>${esc(c.scope)}</p>
      <p><small>Covers: ${covers}${after}</small></p>
      <spec-rice reach="${r.reach}" impact="${r.impact}" confidence="${r.confidence}" effort="${r.effort}"></spec-rice>${provisional}
    </li>`;
}

function coverageTable(cov: CoverageReport): string {
  const rows = cov.assignments
    .map((a) => {
      let cell: string;
      if (a.childSpecId) cell = `<a href="#${esc(a.childSpecId)}">${esc(a.childSpecId)}</a>`;
      else if (a.duplicatedIn)
        cell = `<span class="coverage-gap">duplicated in ${a.duplicatedIn.map(esc).join(', ')}</span>`;
      else cell = '<span class="coverage-gap">— unassigned —</span>';
      return `      <tr><td>${esc(a.requirementId)}</td><td>${cell}</td></tr>`;
    })
    .join('\n');
  const status = cov.isTotalAndDisjoint
    ? '<span class="coverage-ok">total + disjoint</span>'
    : '<span class="coverage-gap">incomplete partition</span>';
  let semanticLine = '';
  if (cov.semantic) {
    const badge = cov.semantic.ok
      ? '<span class="coverage-ok">passed</span>'
      : '<span class="coverage-gap">concerns</span>';
    const notes = cov.semantic.notes.length > 0 ? ` — ${cov.semantic.notes.map(esc).join('; ')}` : '';
    semanticLine = `\n  <p>Semantic check: ${badge}${notes}</p>`;
  }
  return `  <p>Coverage: ${status}</p>${semanticLine}
  <table>
    <thead><tr><th>Parent requirement</th><th>Assigned child</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>`;
}

/** Assemble the `<spec-split>` section from the model. Carries `data-verdict` (split-well-formed). */
export function renderSplitSection(model: SplitModel): string {
  const verdictLabel = model.verdict.kind === 'split' ? 'Split proposed' : 'Do not split';
  const reasons =
    model.verdict.kind === 'dont-split'
      ? `  <ul>${model.verdict.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>\n`
      : '';
  const children = model.orderedChildren.map((c, i) => childBlock(c, i + 1)).join('\n');
  const overBudget =
    model.overBudgetChildren.length > 0
      ? `  <p class="coverage-gap">Over-budget children (recursive-split risk): ${model.overBudgetChildren.map(esc).join(', ')}</p>\n`
      : '';
  return `<spec-split data-verdict="${model.verdict.kind}">
  <header><strong>Split proposal · ${esc(model.parentSpecId)}</strong> — <span class="verdict">${verdictLabel}</span></header>
${reasons}  <ol class="split-children">
${children}
  </ol>
${coverageTable(model.coverage)}
${overBudget}</spec-split>`;
}

/**
 * Append the proposal section to a parent spec, inserted before `</main>`
 * (additive — NFR-002). If the parent has no `</main>`, it is appended at the end.
 */
export function appendSplitToParent(parentHtml: string, section: string): string {
  const marker = '</main>';
  const idx = parentHtml.lastIndexOf(marker);
  if (idx === -1) return `${parentHtml}\n${section}\n`;
  return `${parentHtml.slice(0, idx)}\n${section}\n${parentHtml.slice(idx)}`;
}
