/**
 * Author a change proposal for an existing spec.
 *
 * Canonical procedure: commands/spectastic.propose.md.
 *
 * v0.1 scope (per 013-core-propose plan): base propose + adversarial
 * pass via ctx.ai.subagent() — the first verb that uses subagent
 * semantics. The Claude provider's subagent() is implemented in this
 * slice's PR (007 shipped a stub).
 *
 * Heuristic fire (auto): must-tier touched OR removed-op OR ≥2 topic
 * prefixes. Author can override via input.adversarial = true | false.
 */

import type {
  Delta,
  KernelContext,
  ProposeInput,
  ProposeResult,
  RiskFinding,
} from '../types.js';

const CRITIC_SYSTEM = `You are an adversarial reviewer of a software change proposal. Identify exactly three concrete risks. For each: name the affected delta/requirement, explain the worry in one paragraph, and frame the 30-day regret. Return ONLY JSON: { "risks": [ { "target": string, "concern": string }, ... ] }.`;

export async function proposeCommand(
  input: ProposeInput,
  ctx: KernelContext,
): Promise<ProposeResult> {
  if (!ctx.ai) throw new Error('proposeCommand requires ctx.ai');

  // Draft the proposal body via chat.
  const draftPrompt = [
    `Draft a change proposal against this spec:`,
    input.specHtml.slice(0, 6000),
    '',
    `Change request: ${input.description}`,
    '',
    'Return JSON: { "intent": string, "scope": string, "approach": string, "deltas": [ { "op": "added"|"modified"|"removed"|"renamed", "target": "REQ-ID", "postState"?: string, "reason"?: string, "migration"?: string } ] }',
  ].join('\n');
  const draftRaw = await ctx.ai.chat(draftPrompt, {
    temperature: 0,
    system: 'Output ONLY the requested JSON.',
  });
  const draft = tryParse(draftRaw);
  if (!draft) throw new Error('proposeCommand: AI returned non-JSON draft');

  const deltas = (draft.deltas ?? []) as Delta[];

  // Adversarial-pass heuristic.
  const shouldAdversarial =
    input.adversarial === true ||
    (input.adversarial !== false &&
      (deltas.some((d) => d.op === 'removed') ||
        topicPrefixCount(deltas) >= 2 ||
        touchesMustTier(deltas, input.specHtml)));

  let risks: RiskFinding[] = [];
  if (shouldAdversarial) {
    const proposalDraft = JSON.stringify(draft, null, 2);
    const subResult = await ctx.ai.subagent(
      `Review this draft proposal against the spec and identify 3 risks.\n\nSpec excerpt:\n${input.specHtml.slice(0, 3000)}\n\nDraft proposal:\n${proposalDraft}`,
      { task: 'adversarial-risk-pass' },
    );
    risks = parseRisks(subResult.output);
  }

  const html = renderProposalHtml(input.specId, input.description, draft, risks);
  return { html, deltasCount: deltas.length, risks };
}

interface ParsedDraft {
  intent?: string;
  scope?: string;
  approach?: string;
  deltas?: Delta[];
}

function tryParse(raw: string): ParsedDraft | null {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(stripped) as ParsedDraft; } catch { return null; }
}

function parseRisks(raw: string): RiskFinding[] {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const p = JSON.parse(stripped) as { risks?: Array<{ target: string; concern: string }> };
    return (p.risks ?? []).slice(0, 3).map((r) => ({
      target: r.target,
      status: 'identified' as const, // defensively forced per 013 D-005
      concern: r.concern,
    }));
  } catch {
    return [];
  }
}

function topicPrefixCount(deltas: Delta[]): number {
  const prefixes = new Set<string>();
  for (const d of deltas) {
    const m = d.target.match(/^[A-Z]+-[A-Z]+/);
    if (m) prefixes.add(m[0]);
  }
  return prefixes.size;
}

function touchesMustTier(deltas: Delta[], specHtml: string): boolean {
  for (const d of deltas) {
    const re = new RegExp(`<spec-requirement[^>]*\\bid=["']${d.target}["'][^>]*\\bpriority=["']must["']`, 'i');
    if (re.test(specHtml)) return true;
    if (d.postState && /priority=["']must["']/.test(d.postState)) return true;
  }
  return false;
}

function renderProposalHtml(
  specId: string,
  description: string,
  draft: ParsedDraft,
  risks: RiskFinding[],
): string {
  const today = new Date().toISOString().slice(0, 10);
  const deltaBlocks = (draft.deltas ?? []).map((d) =>
    `<spec-delta op="${d.op}" target="${d.target}">${d.postState ? `<spec-requirement id="${d.target}" priority="must"><p>${esc(d.postState)}</p></spec-requirement>` : ''}${d.reason ? `<div class="reason-block"><p><strong>Reason.</strong> ${esc(d.reason)}</p></div>` : ''}${d.migration ? `<div class="migration-block"><p><strong>Migration.</strong> ${esc(d.migration)}</p></div>` : ''}</spec-delta>`,
  ).join('\n');
  const riskBlocks = risks.map((r) =>
    `<spec-risk target="${r.target}" status="identified"><header><h4>${esc(r.concern.slice(0, 80))}</h4></header><p><strong>Concern.</strong> ${esc(r.concern)}</p><div class="response"><em>Author response not yet recorded.</em></div></spec-risk>`,
  ).join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(description)} · Change proposal</title>
<link rel="stylesheet" href="../../../../assets/spec.css"></head><body><main>
<header><p class="small-caps">Change proposal · ${esc(specId)}</p><h1>${esc(description)}</h1>
<spec-meta><b>Status</b><span><spec-status value="review">Under review</spec-status></span><b>Spec</b><span><a href="../../spec.html">${esc(specId)}</a></span><b>Created</b><span><time datetime="${today}">${today}</time></span></spec-meta>
<spec-tldr><p>${esc(draft.intent ?? description)}</p></spec-tldr></header>

<spec-change id="${today}-${slugify(description)}" status="review">
<section id="scope"><h2>2 · Scope</h2><p>${esc(draft.scope ?? '')}</p></section>
<section id="approach"><h2>3 · Approach</h2><p>${esc(draft.approach ?? '')}</p></section>
<section id="deltas"><h2>4 · Deltas</h2>${deltaBlocks}</section>
${risks.length > 0 ? `<section id="risks"><h2>5 · Risk register</h2><spec-risk-log>${riskBlocks}</spec-risk-log></section>` : ''}
<section id="changelog"><h2>8 · Change log</h2><spec-changelog><ol><li><time datetime="${today}">${today}</time><span>Proposal authored via proposeCommand.${risks.length > 0 ? ` Adversarial pass produced ${risks.length} findings.` : ''}</span></li></ol></spec-changelog></section>
</spec-change>
</main><script src="../../../../assets/spec.js"></script></body></html>
`;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
