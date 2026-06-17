/**
 * Author (or sharpen) an implementation plan for an existing spec.
 *
 * Canonical procedure: commands/spectastic.plan.md.
 *
 * v0.1 scope (per 012-core-plan plan): estimability gate first
 * (refuses if the spec has open <spec-question>, [NEEDS CLARIFICATION],
 * missing defer-to); AI generates ADRs + alternatives matrix; returns
 * the rendered plan.html. Caller writes it.
 */

import type {
  KernelContext,
  PlanInput,
  PlanResult,
} from '../types.js';

const BLOCKER_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'open <spec-question>', re: /<spec-questions?>[\s\S]*?<ol>[\s\S]*?<li[^>]*>(?!\s*(?:<\/li>|None at write time))/i },
  { name: '[NEEDS CLARIFICATION]', re: /\[NEEDS CLARIFICATION/i },
  { name: 'missing defer-to', re: /<spec-out-of-scope[^>]*>[\s\S]*?<li(?![^>]*\bdefer-to=)/i },
];

export async function planCommand(
  input: PlanInput,
  ctx: KernelContext,
): Promise<PlanResult> {
  if (!ctx.ai) throw new Error('planCommand requires ctx.ai');

  // Estimability gate.
  const blockers: string[] = [];
  for (const { name, re } of BLOCKER_PATTERNS) {
    if (re.test(input.specHtml)) blockers.push(name);
  }
  if (blockers.length > 0) {
    return {
      html: '',
      decisionsCount: 0,
      estimabilityBlockers: blockers,
      principlesCheck: { ok: 0, exceptions: 0, violations: 0 },
    };
  }

  const isReentry = !!input.existingPlan;
  const prompt = [
    isReentry
      ? `Sharpen this plan. ADD or ENHANCE only; never remove existing ADRs.\nExisting plan:\n${input.existingPlan!.slice(0, 6000)}`
      : `Author an implementation plan for the spec below.\nSpec:\n${input.specHtml.slice(0, 6000)}`,
    input.principlesHtml ? `\nPrinciples to check:\n${input.principlesHtml.slice(0, 3000)}` : '',
    '',
    'Return JSON: { "approach": string, "decisions": [ { "id": "D-001", "title": string, "context": string, "decision": string, "consequences": string } ], "alternatives": [ { "name": string, "scores": [number, number, number], "isWinner": boolean } ], "risks": [ { "risk": string, "mitigation": string } ], "principles": [ { "id": "P-1", "status": "OK"|"EXCEPTION"|"VIOLATION", "note": string } ] }',
  ].filter(Boolean).join('\n');

  const raw = await ctx.ai.chat(prompt, {
    temperature: 0,
    system: 'Output ONLY the requested JSON. No prose, no fences.',
  });

  const parsed = tryParse(raw);
  if (!parsed) throw new Error('planCommand: AI returned non-JSON');

  const principlesCheck = {
    ok: (parsed.principles ?? []).filter((p) => p.status === 'OK').length,
    exceptions: (parsed.principles ?? []).filter((p) => p.status === 'EXCEPTION').length,
    violations: (parsed.principles ?? []).filter((p) => p.status === 'VIOLATION').length,
  };

  if (principlesCheck.violations > 0) {
    throw new Error(
      `planCommand: ${principlesCheck.violations} principle(s) marked VIOLATION; revise the plan or amend the principles.`,
    );
  }

  const html = renderPlanHtml(input.specId, parsed, isReentry);
  return {
    html,
    decisionsCount: (parsed.decisions ?? []).length,
    estimabilityBlockers: [],
    principlesCheck,
  };
}

interface ParsedPlan {
  approach?: string;
  decisions?: Array<{ id: string; title: string; context: string; decision: string; consequences: string }>;
  alternatives?: Array<{ name: string; scores: number[]; isWinner?: boolean }>;
  risks?: Array<{ risk: string; mitigation: string }>;
  principles?: Array<{ id: string; status: 'OK' | 'EXCEPTION' | 'VIOLATION'; note: string }>;
}

function tryParse(raw: string): ParsedPlan | null {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(stripped) as ParsedPlan; } catch { return null; }
}

function renderPlanHtml(specId: string, p: ParsedPlan, isReentry: boolean): string {
  const today = new Date().toISOString().slice(0, 10);
  const decisions = (p.decisions ?? []).map((d) =>
    `<spec-decision id="${d.id}"><h4>${d.id} · ${esc(d.title)}</h4><dl><dt>Status</dt><dd><spec-status value="accepted">Accepted</spec-status></dd><dt>Context</dt><dd>${esc(d.context)}</dd><dt>Decision</dt><dd>${esc(d.decision)}</dd><dt>Consequences</dt><dd>${esc(d.consequences)}</dd></dl></spec-decision>`,
  ).join('\n');
  const alternatives = (p.alternatives ?? []).map((a) => {
    const total = a.scores.reduce((s, n) => s + n, 0);
    return `<tr${a.isWinner ? ' data-winner' : ''}><td>${esc(a.name)}</td>${a.scores.map((n) => `<td>${n}</td>`).join('')}<td class="score">${total}</td></tr>`;
  }).join('\n');
  const principlesRows = (p.principles ?? []).map((pp) =>
    `<tr><td>${esc(pp.id)}</td><td><spec-pill>${pp.status}</spec-pill></td><td>${esc(pp.note)}</td></tr>`,
  ).join('\n');
  const risksRows = (p.risks ?? []).map((r) =>
    `<tr><td>${esc(r.risk)}</td><td>${esc(r.mitigation)}</td></tr>`,
  ).join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(specId)} · Plan</title>
<link rel="stylesheet" href="../../assets/spec.css"></head><body><main>
<header><p class="small-caps">Implementation plan · ${esc(specId)}</p><h1>${esc(specId)} — plan</h1>
<spec-meta><b>Status</b><span><spec-status value="draft">Draft</spec-status></span><b>Spec</b><span><a href="./spec.html">${esc(specId)}</a></span><b>Created</b><span><time datetime="${today}">${today}</time></span></spec-meta>
<spec-tldr><p>${esc(p.approach ?? 'Plan generated programmatically.')}</p></spec-tldr></header>

<section id="principles-check"><h2>1 · Principles check</h2><table><thead><tr><th>Principle</th><th>Compliance</th><th>Notes</th></tr></thead><tbody>${principlesRows}</tbody></table></section>

<section id="decisions"><h2>5 · Decisions</h2>${decisions}</section>

<section id="alternatives"><h2>4 · Alternatives</h2><spec-matrix><table><thead><tr><th>Option</th><th>C1</th><th>C2</th><th>C3</th><th class="score">Total</th></tr></thead><tbody>${alternatives}</tbody></table></spec-matrix></section>

<section id="risks"><h2>7 · Risks</h2><table><thead><tr><th>Risk</th><th>Mitigation</th></tr></thead><tbody>${risksRows}</tbody></table></section>

<section id="changelog"><h2>10 · Change log</h2><spec-changelog><ol><li><time datetime="${today}">${today}</time><span>${isReentry ? 'Re-entry via planCommand' : 'Initial plan via planCommand'}.</span></li></ol></spec-changelog></section>
</main><script src="../../assets/spec.js"></script></body></html>
`;
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
