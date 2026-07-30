/**
 * Draft a decomposition of an over-budget parent into covering child slices
 * (spec 029, plan D-002 / FR-001). The agentic step: `ctx.ai.chat` returns the
 * candidate children — title, scope, the parent requirement IDs each claims,
 * inter-child `dependsOn` edges, and estimated RICE (FR-004). Pure parsing of a
 * non-deterministic draft; the partition + critic verify it downstream.
 */

import type { KernelContext } from '../types.js';
import type { CandidateChild, Decomposition } from './types.js';

const SYSTEM =
  'You are an experienced spec author following the spectastic discipline. Decompose an over-budget spec into the smallest set of independently-demoable child slices that together cover every requirement exactly once. Output ONLY the requested JSON; no prose, no fences.';

const SCHEMA =
  'Return JSON: { "children": [ { "specId": "NNN-slug", "title": string, "scope": string, "assignedRequirementIds": ["FR-001", ...], "dependsOn": ["NNN-slug", ...], "rice": { "reach": number, "impact": number, "confidence": number, "effort": number } } ] }';

/** Raw child shape as drafted by the model (before `riceConfirmed` is attached). */
type DraftChild = Omit<CandidateChild, 'riceConfirmed'>;

export async function decompose(parentHtml: string, ctx: KernelContext): Promise<Decomposition> {
  if (!ctx.ai) throw new Error('decompose requires ctx.ai');
  const prompt = [
    'Decompose this over-budget spec into two or more covering child slices. Assign every FR/NFR/SC id to exactly one child. Use dependsOn for child spec ids that must be built first. Estimate RICE per child.',
    SCHEMA,
    '',
    'Spec:',
    parentHtml.slice(0, 6000),
  ].join('\n');

  const raw = await ctx.ai.chat(prompt, { temperature: 0, system: SYSTEM });
  const children = parseChildren(raw).map((c) => ({
    ...c,
    riceConfirmed: false,
  }));
  return { children };
}

function parseChildren(raw: string): DraftChild[] {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  let parsed: { children?: DraftChild[] };
  try {
    parsed = JSON.parse(stripped) as { children?: DraftChild[] };
  } catch {
    throw new Error('decompose: AI returned non-JSON decomposition');
  }
  return parsed.children ?? [];
}
