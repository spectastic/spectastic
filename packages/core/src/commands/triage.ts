/**
 * Triage a defect or list of defects into structured cards.
 *
 * Canonical procedure: commands/spectastic.triage.md (consumed by the
 * /spectastic.triage slash command). The slash command runs in-LLM
 * inside Claude Code; this kernel function exposes the same logic to
 * standalone CLI / MCP / VS Code surfaces. Per 006 FR-008 the markdown
 * remains the source of truth; this docblock points back.
 *
 * Implements FR-004 + FR-005 of specs/007-core-triage/spec.html.
 *
 * Both modes:
 *   - single-card: caller passes specId; result.cards has one TriageCard
 *     bound to that spec's triage-log.html.
 *   - list-intake: detected via the heuristic (per D-006); result.cards
 *     has one per item, each independently classified into one of the
 *     eight layers per FR-009.
 *
 * The kernel returns structured cards and does NOT hard-code destination
 * paths (FR-010). The caller routes each card based on its layer:
 *   - diagnostic layers (spec / plan / implementation / cross-spec /
 *     principles / platform) → specs/<spec-id>/triage-log.html
 *   - routing exits (just-do / defer) → inbox.html
 */

import type {
  AIProvider,
  KernelContext,
  Question,
  TriageCard,
  TriageInput,
  TriageLayer,
  TriageResult,
} from '../types.js';
import { detectMode } from '../helpers/detect-mode.js';

const ALL_LAYERS: ReadonlyArray<TriageLayer> = [
  'spec',
  'plan',
  'implementation',
  'cross-spec',
  'principles',
  'platform',
  'just-do',
  'defer',
];

export async function triageCommand(
  input: TriageInput,
  ctx: KernelContext,
): Promise<TriageResult> {
  if (!ctx.ai) {
    throw new Error('triageCommand requires ctx.ai (an AIProvider); got undefined');
  }
  const mode = input.mode ?? detectMode(input.description);

  if (mode === 'single') {
    const card = await characterise(input, ctx.ai, 'single');
    const id = formatId(card.layer, input.startingIdT ?? 0, input.startingIdI ?? 0, 1);
    return { cards: [{ ...card, id }] };
  }

  const items = splitList(input.description);
  const cards: TriageCard[] = [];
  let tCount = 0;
  let iCount = 0;
  for (const item of items) {
    const card = await characterise(
      { ...input, description: item },
      ctx.ai,
      'list',
    );
    const isRoutingExit = card.layer === 'just-do' || card.layer === 'defer';
    if (isRoutingExit) {
      iCount += 1;
      cards.push({ ...card, id: formatId(card.layer, 0, input.startingIdI ?? 0, iCount) });
    } else {
      tCount += 1;
      cards.push({ ...card, id: formatId(card.layer, input.startingIdT ?? 0, 0, tCount) });
    }
  }
  return { cards };
}

async function characterise(
  input: TriageInput,
  ai: AIProvider,
  mode: 'single' | 'list',
): Promise<Omit<TriageCard, 'id'>> {
  const prompt = buildCharacterisePrompt(input, mode);
  const response = await ai.chat(prompt, {
    temperature: 0,
    system:
      'You are a defect-triage assistant. Output is parsed by a program. Return ONLY a JSON object with the requested fields; no prose, no explanation, no code fences.',
  });
  const parsed = parseCard(response);
  if (!parsed) {
    throw new Error(`triageCommand: failed to parse characterisation JSON for input: ${input.description.slice(0, 80)}`);
  }
  // Layer escalation if the model hedged.
  if (parsed.layerConfidence === 'low' || !isValidLayer(parsed.layer)) {
    parsed.layer = await escalateLayer(input.description, parsed.layer, ai);
  }
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

async function escalateLayer(
  description: string,
  hedged: string,
  ai: AIProvider,
): Promise<TriageLayer> {
  // First ask: diagnostic vs routing?
  const q1: Question = {
    question:
      `Defect description: "${description.slice(0, 200)}". The first-pass classification was ambiguous (hedged: "${hedged}"). Is this a diagnostic-layer defect (spec / plan / implementation / cross-spec / principles / platform) or a routing-exit item (just-do / defer)?`,
    header: 'category',
    options: [
      { label: 'diagnostic', description: 'A defect in the spec, plan, code, cross-spec contract, principles, or platform.' },
      { label: 'routing', description: 'Not a classic defect — just-do (implement immediately) or defer (back-burner).' },
    ],
  };
  const a1 = await ai.ask<{ category: 'diagnostic' | 'routing' }>([q1]);

  if (a1.category === 'routing') {
    const q2: Question = {
      question: 'Which routing exit?',
      header: 'layer',
      options: [
        { label: 'just-do', description: 'Implement immediately; no proposal cycle.' },
        { label: 'defer', description: 'Back-burner with a defer-to target.' },
      ],
    };
    const a2 = await ai.ask<{ layer: TriageLayer }>([q2]);
    return a2.layer;
  }

  const q2: Question = {
    question: 'Which diagnostic layer?',
    header: 'layer',
    options: [
      { label: 'spec', description: 'User-visible behavior / NFR / contract is missing or wrong.' },
      { label: 'plan', description: 'Spec correct; technical decision violates a constraint.' },
      { label: 'implementation', description: 'Spec + plan correct; code drifted.' },
      { label: 'cross-spec', description: 'Two specs disagree on a shared contract.' },
    ],
  };
  const a2 = await ai.ask<{ layer: TriageLayer }>([q2]);
  return a2.layer;
}

function buildCharacterisePrompt(input: TriageInput, mode: 'single' | 'list'): string {
  return [
    `Triage this ${mode === 'single' ? 'single defect' : 'list item'}:`,
    '',
    input.description,
    '',
    'Return JSON with these fields:',
    '  headline: one-line failure title (≤ 80 chars)',
    '  layer: one of ' + ALL_LAYERS.join(' | '),
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

function parseCard(raw: string): {
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
} | null {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const lc = parsed['layerConfidence'];
    const rr = parsed['regenResult'];
    const dt = parsed['deferTo'];
    const dd = parsed['deepDive'];
    return {
      headline: String(parsed['headline'] ?? ''),
      layer: (parsed['layer'] ?? 'spec') as TriageLayer,
      expected: String(parsed['expected'] ?? ''),
      actual: String(parsed['actual'] ?? ''),
      diagnosis: String(parsed['diagnosis'] ?? ''),
      fix: String(parsed['fix'] ?? ''),
      ...(lc === 'high' || lc === 'medium' || lc === 'low' ? { layerConfidence: lc } : {}),
      ...(rr === 'pass' || rr === 'fail' || rr === 'unsure' ? { regenResult: rr } : {}),
      ...(typeof dt === 'string' ? { deferTo: dt } : {}),
      ...(typeof dd === 'string' ? { deepDive: dd } : {}),
    };
  } catch {
    return null;
  }
}

function isValidLayer(s: string): s is TriageLayer {
  return (ALL_LAYERS as ReadonlyArray<string>).includes(s);
}

function isRoutingExit(layer: TriageLayer): boolean {
  return layer === 'just-do' || layer === 'defer';
}

function formatId(layer: TriageLayer, startingT: number, startingI: number, offset: number): string {
  const isInbox = isRoutingExit(layer);
  const next = (isInbox ? startingI : startingT) + offset;
  const prefix = isInbox ? 'I' : 'T';
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

function splitList(description: string): string[] {
  // Newline-separated takes precedence; fall back to comma / semicolon.
  const lines = description
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•]\s*/, '').replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter((l) => l.length > 0);
  if (lines.length >= 2) return lines;
  return description
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
