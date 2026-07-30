/**
 * Author (or sharpen) a feature spec via two-phase interview.
 *
 * Canonical procedure: commands/spectastic.spec.md.
 *
 * v0.1 scope (per 011-core-spec plan): single AI-led interview pass
 * that produces a spec.html string. The full slash-command discipline
 * (decision exhaustion, INVEST self-check, smallest-demoable prompt
 * first) is preserved; the kernel just runs it programmatically.
 *
 * Re-entry mode: when input.existingSpec is provided, the kernel only
 * ADDs or ENHANCEs; never overwrites without explicit confirmation.
 * The kernel returns the rendered HTML; the caller writes it.
 */

import { buildCorpusPromptBlock, loadCorpus, withCorpusHint } from '@spectastic/corpus';
import { extractHealth } from '@spectastic/schema';
import { fenceArtifactText } from '@spectastic/schema/fence';
import { shouldAutoOffer } from '../slice/gate.js';
import type { KernelContext, SpecInput, SpecResult } from '../types.js';
import { appendSplitToParent, sliceCommand } from './slice.js';

export async function specCommand(input: SpecInput, ctx: KernelContext): Promise<SpecResult> {
  if (!ctx.ai) {
    throw new Error('specCommand requires ctx.ai');
  }
  const specId = input.specId ?? deriveSpecId(input.description);

  // Split-mode (spec 029, FR-001): run the slicer on the parent and append the
  // proposal in place. The caller has already gated on Draft state (FR-008 / P-6).
  if (input.split) {
    if (!input.existingSpec) {
      throw new Error('specCommand: split mode requires the existing parent spec (existingSpec)');
    }
    const slice = await sliceCommand({ parentSpecId: specId, parentHtml: input.existingSpec }, ctx);
    const html = appendSplitToParent(input.existingSpec, slice.splitSection);
    const warnings =
      slice.verdict.kind === 'dont-split' ? [`don't-split verdict: ${slice.verdict.reasons.join('; ')}`] : [];
    if (!slice.model.coverage.isTotalAndDisjoint) {
      warnings.push('coverage partition is incomplete — see the <spec-split> coverage table');
    }
    return {
      html,
      specId,
      requirementsCount: slice.model.orderedChildren.length,
      warnings,
    };
  }

  const isReentry = !!input.existingSpec;
  // Corpus-in-prompt (054-corpus-in-prompt, D-001/D-005): '' when no knowledge/
  // corpus exists, so filter(Boolean) drops it — byte-identical to before.
  const corpusBlock = buildCorpusPromptBlock(loadCorpus(ctx.cwd));

  const prompt = [
    isReentry
      ? `Sharpen this existing spec. Only ADD or ENHANCE; do not remove or rewrite existing content.`
      : `Author a feature spec for: ${input.description}`,
    isReentry ? `Existing spec:\n${fenceArtifactText(input.existingSpec!.slice(0, 8000), 'Existing spec')}` : '',
    corpusBlock ? `\n${corpusBlock}` : '',
    '',
    'Return JSON: { "tldr": string, "stories": [ { "id": "US1", "title": string, "role": string, "want": string, "outcome": string, "acceptance": string, "priority": "P1"|"P2"|"P3" } ], "frs": [ { "id": "FR-001", "priority": "must"|"should"|"may", "body": string } ], "nfrs": [...], "scs": [...], "smallestDemoable": string }',
  ]
    .filter(Boolean)
    .join('\n');

  const raw = await ctx.ai.chat(prompt, {
    temperature: 0,
    system:
      'You are an experienced spec author following the spectastic discipline. Output ONLY the requested JSON; no prose, no fences.',
  });

  const parsed = tryParse(raw);
  if (!parsed) {
    throw new Error('specCommand: AI returned non-JSON spec content');
  }

  const html = renderSpecHtml(specId, parsed, input.description, isReentry);
  const reqCount = (parsed.frs?.length ?? 0) + (parsed.nfrs?.length ?? 0) + (parsed.scs?.length ?? 0);

  const warnings: string[] = [];
  if (reqCount > 20) warnings.push(`requirements count ${reqCount} exceeds 20 — consider splitting`);
  if (!parsed.smallestDemoable) warnings.push('smallest-demoable not surfaced; spec interview may have failed');

  // Auto-offer the slicer when the authored spec crosses the red budget band
  // (spec 029, FR-010). Only surfaces the offer — the author still confirms.
  if (shouldAutoOffer(extractHealth(html).budgetBand)) {
    warnings.push(
      `over the red budget band — consider splitting: run the value-ranked slicer with \`spectastic spec ${specId} --split\` (spec 029).`,
    );
  }

  return withCorpusHint({ html, specId, requirementsCount: reqCount, warnings }, corpusBlock);
}

interface ParsedSpec {
  tldr?: string;
  smallestDemoable?: string;
  stories?: Array<{
    id: string;
    title: string;
    role: string;
    want: string;
    outcome: string;
    acceptance: string;
    priority: string;
  }>;
  frs?: Array<{ id: string; priority: string; body: string }>;
  nfrs?: Array<{ id: string; priority: string; body: string }>;
  scs?: Array<{ id: string; priority: string; body: string }>;
}

function tryParse(raw: string): ParsedSpec | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(stripped) as ParsedSpec;
  } catch {
    return null;
  }
}

function deriveSpecId(description: string): string {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `000-${slug || 'unnamed'}`;
}

function renderSpecHtml(specId: string, s: ParsedSpec, description: string, isReentry: boolean): string {
  const today = new Date().toISOString().slice(0, 10);
  const stories = (s.stories ?? [])
    .map(
      (st) =>
        `<h3>${st.id} · ${esc(st.title)} <spec-pill>${st.priority}</spec-pill></h3>\n<p>As a <strong>${esc(st.role)}</strong>, I want to <strong>${esc(st.want)}</strong> so that <strong>${esc(st.outcome)}</strong>.</p>\n<p><em>Acceptance:</em> ${esc(st.acceptance)}</p>`,
    )
    .join('\n\n');
  const reqBlock = (list: Array<{ id: string; priority: string; body: string }>): string =>
    list
      .map(
        (r) => `<spec-requirement id="${r.id}" priority="${r.priority}">\n<p>${esc(r.body)}</p>\n</spec-requirement>`,
      )
      .join('\n\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'">
<title>${esc(specId)} · Specification</title>
<link rel="stylesheet" href="../../assets/spec.css"></head><body><main>
<header>
<p class="small-caps">Specification · ${esc(specId)}</p>
<h1>${esc(description)}</h1>
<spec-meta>
<b>Status</b><span><spec-status value="draft">Draft</spec-status></span>
<b>Spec ID</b><span>${esc(specId)}</span>
<b>Created</b><span><time datetime="${today}">${today}</time></span>
<b>Smallest demoable</b><span>${esc(s.smallestDemoable ?? 'TBD')}</span>
</spec-meta>
<spec-tldr><p>${esc(s.tldr ?? description)}</p></spec-tldr>
</header>

<section id="scenarios"><h2>2 · User scenarios</h2>
${stories || '<p>No user stories surfaced; revisit the interview.</p>'}
</section>

<section id="requirements"><h2>3 · Requirements</h2>
<h3>Functional</h3>
${reqBlock(s.frs ?? [])}
<h3>Non-functional</h3>
${reqBlock(s.nfrs ?? [])}
</section>

<section id="success"><h2>5 · Success criteria</h2>
${reqBlock(s.scs ?? [])}
</section>

<section id="changelog"><h2>9 · Change log</h2><spec-changelog><ol>
<li><time datetime="${today}">${today}</time><span>${isReentry ? 'Re-entry: spec sharpened via specCommand' : 'Initial draft authored via specCommand'}.</span></li>
</ol></spec-changelog></section>
</main><script src="../../assets/spec.js"></script></body></html>
`;
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
