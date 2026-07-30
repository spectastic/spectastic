/**
 * The shared triage classification core (spec 032-triage-fanout, plan D-003).
 *
 * Extracted from commands/triage.ts so BOTH backends — the CLI (ai.chat) and the
 * Workflow (ai.subagent) — classify against one design: same prompt, same layer
 * taxonomy, same routing, same hedge test (spec FR-001). Two properties make it
 * safe to fan out concurrently:
 *
 *   - `classifyItem` is a TOTAL function: it never calls `ai.ask` and never
 *     throws. A provider/parse error becomes `status:'failed'` (spec FR-004);
 *     a low-confidence result becomes `status:'hedged'`. The human gate
 *     (`escalateLayer`) runs LATER, in one post-pass, never interleaved with the
 *     concurrent classification (spec FR-005).
 *   - The hedge decision lives HERE, in the shared core, not in either backend's
 *     orchestration — so the gate fires identically wherever the fan-out runs
 *     (spec FR-006, principle P-8).
 */

import { fenceArtifactText } from '@spectastic/schema/fence';
import { decideChoice } from '../decider/choice.js';
import type { DeciderConfig } from '../decider/types.js';
import type { AIProvider, Question, TriageCard, TriageInput, TriageLayer } from '../types.js';

export const ALL_LAYERS: ReadonlyArray<TriageLayer> = [
  'spec',
  'plan',
  'implementation',
  'cross-spec',
  'principles',
  'platform',
  'just-do',
  'defer',
];

const CLASSIFY_SYSTEM =
  'You are a defect-triage assistant. Output is parsed by a program. Return ONLY a JSON object with the requested fields; no prose, no explanation, no code fences.';

export type ClassifyStatus = 'ok' | 'hedged' | 'failed';

export interface ClassifyResult {
  /** ok = confident; hedged = low confidence / invalid layer; failed = provider or parse error. */
  status: ClassifyStatus;
  /** The card body without an id. For hedged/failed the `layer` is provisional until the gate resolves it. */
  draft: Omit<TriageCard, 'id'>;
  /** The provisional layer to seed the gate (present for hedged and failed). */
  hedgedFrom?: TriageLayer;
  /** A model-supplied defer-to target, carried so the gate can re-attach it if it resolves to `defer`. */
  deferTo?: string;
}

/**
 * Classify a single item into a draft card. Total: never asks, never throws.
 * `backend` selects the provider method — `chat` (CLI) or `subagent` (Workflow);
 * both consume the same JSON contract, so the result is backend-independent.
 */
export async function classifyItem(
  input: TriageInput,
  ai: AIProvider,
  mode: 'single' | 'list',
  backend: 'chat' | 'subagent' = 'chat',
): Promise<ClassifyResult> {
  try {
    const prompt = buildCharacterisePrompt(input, mode);
    const raw =
      backend === 'subagent'
        ? (
            await ai.subagent(`${CLASSIFY_SYSTEM}\n\n${prompt}`, {
              task: 'triage-classify',
            })
          ).output
        : await ai.chat(prompt, { temperature: 0, system: CLASSIFY_SYSTEM });
    const parsed = parseCard(raw);
    if (!parsed) {
      return {
        status: 'failed',
        draft: failedDraft(input.description),
        hedgedFrom: 'implementation',
      };
    }
    const draft = buildDraft(parsed);
    if (parsed.layerConfidence === 'low' || !isValidLayer(parsed.layer)) {
      return {
        status: 'hedged',
        draft,
        hedgedFrom: parsed.layer,
        ...(parsed.deferTo ? { deferTo: parsed.deferTo } : {}),
      };
    }
    return { status: 'ok', draft };
  } catch {
    return {
      status: 'failed',
      draft: failedDraft(input.description),
      hedgedFrom: 'implementation',
    };
  }
}

/**
 * The human-commit gate (spec FR-006). Uses the bounded-choice Decider and so MUST
 * run outside the concurrent pass — the fan-out collects hedged/failed items and
 * runs this in one consolidated post-pass. Per spec 036 the two asks route through
 * `decideChoice` (`cfg`, default human): a human, agent, or panel resolves the
 * category then the layer. Human default is behaviour-identical to the prior inline
 * `ai.ask` escalation.
 */
export async function escalateLayer(
  description: string,
  hedged: string,
  ai: AIProvider,
  cfg: DeciderConfig = { role: 'human', effort: 'medium' },
): Promise<TriageLayer> {
  const q1: Question = {
    question: `Defect description: "${description.slice(0, 200)}". The first-pass classification was ambiguous (hedged: "${hedged}"). Is this a diagnostic-layer defect (spec / plan / implementation / cross-spec / principles / platform) or a routing-exit item (just-do / defer)?`,
    header: 'category',
    options: [
      {
        label: 'diagnostic',
        description: 'A defect in the spec, plan, code, cross-spec contract, principles, or platform.',
      },
      {
        label: 'routing',
        description: 'Not a classic defect — just-do (implement immediately) or defer (back-burner).',
      },
    ],
  };
  const a1 = await decideChoice(cfg, [q1], ai);

  if (a1.category === 'routing') {
    const q2: Question = {
      question: 'Which routing exit?',
      header: 'layer',
      options: [
        {
          label: 'just-do',
          description: 'Implement immediately; no proposal cycle.',
        },
        { label: 'defer', description: 'Back-burner with a defer-to target.' },
      ],
    };
    const a2 = await decideChoice(cfg, [q2], ai);
    return a2.layer as TriageLayer;
  }

  const q2: Question = {
    question: 'Which diagnostic layer?',
    header: 'layer',
    options: [
      {
        label: 'spec',
        description: 'User-visible behavior / NFR / contract is missing or wrong.',
      },
      {
        label: 'plan',
        description: 'Spec correct; technical decision violates a constraint.',
      },
      {
        label: 'implementation',
        description: 'Spec + plan correct; code drifted.',
      },
      {
        label: 'cross-spec',
        description: 'Two specs disagree on a shared contract.',
      },
    ],
  };
  const a2 = await decideChoice(cfg, [q2], ai);
  return a2.layer as TriageLayer;
}

/**
 * Apply a (possibly gate-resolved) layer to a draft, re-deriving the
 * layer-dependent fields exactly as buildDraft would for that final layer:
 * routing exits carry no regenResult; `defer` may carry a model-supplied deferTo;
 * diagnostic layers default regenResult to 'unsure'.
 */
export function applyLayer(
  draft: Omit<TriageCard, 'id'>,
  layer: TriageLayer,
  deferTo?: string,
): Omit<TriageCard, 'id'> {
  const { regenResult: _rr, deferTo: _dt, ...base } = draft;
  if (isRoutingExit(layer)) {
    return layer === 'defer' && deferTo ? { ...base, layer, deferTo } : { ...base, layer };
  }
  return { ...base, layer, regenResult: draft.regenResult ?? 'unsure' };
}

function buildDraft(parsed: ParsedCard): Omit<TriageCard, 'id'> {
  return {
    layer: parsed.layer,
    headline: parsed.headline,
    expected: parsed.expected,
    actual: parsed.actual,
    diagnosis: parsed.diagnosis,
    fix: parsed.fix,
    ...(isRoutingExit(parsed.layer) ? {} : { regenResult: parsed.regenResult ?? 'unsure' }),
    ...(parsed.layer === 'defer' && parsed.deferTo ? { deferTo: parsed.deferTo } : {}),
    ...(parsed.deepDive ? { deepDive: parsed.deepDive } : {}),
  };
}

/** A placeholder card for an item that could not be classified; the gate resolves its layer. */
function failedDraft(description: string): Omit<TriageCard, 'id'> {
  const snippet = description.slice(0, 60);
  return {
    layer: 'implementation',
    headline: `Classification failed — needs review: ${snippet}`,
    expected: 'The item is classified into a layer.',
    actual: 'The classifier errored or returned unparseable output.',
    diagnosis: 'Provider error or malformed response; routed to the human gate for manual classification.',
    fix: 'Re-triage this item manually.',
    regenResult: 'unsure',
  };
}

export function buildCharacterisePrompt(input: TriageInput, mode: 'single' | 'list'): string {
  return [
    `Triage this ${mode === 'single' ? 'single defect' : 'list item'}:`,
    '',
    fenceArtifactText(input.description, 'Defect description'),
    '',
    'Return JSON with these fields:',
    '  headline: one-line failure title (≤ 80 chars)',
    `  layer: one of ${ALL_LAYERS.join(' | ')}`,
    '  layerConfidence: "high" | "medium" | "low"',
    '  expected: single sentence',
    '  actual: single sentence',
    '  diagnosis: single sentence root cause; may cite REQ IDs',
    '  fix: artifact path + one-line proposal',
    '  regenResult: "pass" | "fail" | "unsure" (omit for just-do / defer)',
    '  deferTo: target (when layer === "defer"; else omit)',
    '  deepDive: optional prose (omit unless cross-spec / principles / cascade required)',
  ].join('\n');
}

interface ParsedCard {
  headline: string;
  layer: TriageLayer;
  layerConfidence?: 'high' | 'medium' | 'low';
  expected: string;
  actual: string;
  diagnosis: string;
  fix: string;
  regenResult?: 'pass' | 'fail' | 'unsure';
  deferTo?: string;
  deepDive?: string;
}

export function parseCard(raw: string): ParsedCard | null {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const lc = parsed.layerConfidence;
    const rr = parsed.regenResult;
    const dt = parsed.deferTo;
    const dd = parsed.deepDive;
    return {
      headline: String(parsed.headline ?? ''),
      layer: (parsed.layer ?? 'spec') as TriageLayer,
      expected: String(parsed.expected ?? ''),
      actual: String(parsed.actual ?? ''),
      diagnosis: String(parsed.diagnosis ?? ''),
      fix: String(parsed.fix ?? ''),
      ...(lc === 'high' || lc === 'medium' || lc === 'low' ? { layerConfidence: lc } : {}),
      ...(rr === 'pass' || rr === 'fail' || rr === 'unsure' ? { regenResult: rr } : {}),
      ...(typeof dt === 'string' ? { deferTo: dt } : {}),
      ...(typeof dd === 'string' ? { deepDive: dd } : {}),
    };
  } catch {
    return null;
  }
}

export function isValidLayer(s: string): s is TriageLayer {
  return (ALL_LAYERS as ReadonlyArray<string>).includes(s);
}

export function isRoutingExit(layer: TriageLayer): boolean {
  return layer === 'just-do' || layer === 'defer';
}

export function formatId(layer: TriageLayer, startingT: number, startingI: number, offset: number): string {
  const isInbox = isRoutingExit(layer);
  const next = (isInbox ? startingI : startingT) + offset;
  const prefix = isInbox ? 'I' : 'T';
  return `${prefix}-${String(next).padStart(3, '0')}`;
}
