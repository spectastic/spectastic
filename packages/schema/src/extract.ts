/**
 * Structured metadata extraction from a parsed spec-html document.
 *
 * Per D-006 of specs/009-core-tasks/design.html: surfaces the FR/NFR/SC
 * IDs + priorities + summaries so the kernel's tasks command can
 * map requirements to phases + assert traceability without re-parsing.
 *
 * First @spectastic/schema API surface extension by a sibling slice.
 * Pre-1.0 minor bump (consumers should pin tightly).
 */

import { findAll, getAttr, parse } from './parser.js';
import type { ParsedDocument } from './types.js';

export interface Requirement {
  id: string;
  priority: 'must' | 'should' | 'may';
  summary: string;
}

export interface SpecMetadata {
  /** Spec ID extracted from <p class="small-caps">Specification · <id></p>. */
  specId: string | null;
  /** `<spec-meta>` Owner field (the human owner), or null. */
  owner: string | null;
  /** `<spec-meta>` Author field (proposals use Author rather than Owner), or null. */
  author: string | null;
  /** `<spec-meta>` Reviewers field — may be an empty placeholder (e.g. "—"); or null when absent. */
  reviewers: string | null;
  /** Functional requirements (FR-NNN). */
  fr: Requirement[];
  /** Non-functional requirements (NFR-NNN). */
  nfr: Requirement[];
  /** Success criteria (SC-NNN). */
  sc: Requirement[];
}

const FR_RE = /^FR-\d+$/;
const NFR_RE = /^NFR-\d+$/;
const SC_RE = /^SC-\d+$/;

/**
 * Returns the `value` of the first `<spec-status value="…">` element in the
 * document, or `null` if none is present. Used by authoring verbs (principles,
 * tasks, spec, plan) to honour P-6 of principles.html: Draft destinations
 * accept in-place edit; past-Draft destinations route through change-management.
 */
export function extractSpecStatus(htmlOrDoc: string | ParsedDocument): string | null {
  const doc = typeof htmlOrDoc === 'string' ? parse(htmlOrDoc, '<inline>') : htmlOrDoc;
  for (const el of findAll(doc.ast, 'spec-status')) {
    const value = getAttr(el, 'value');
    if (value) return value;
  }
  return null;
}

export function extractSpecMetadata(htmlOrDoc: string | ParsedDocument): SpecMetadata {
  const doc = typeof htmlOrDoc === 'string' ? parse(htmlOrDoc, '<inline>') : htmlOrDoc;

  let specId: string | null = null;
  for (const el of findAll(doc.ast, 'p')) {
    const cls = getAttr(el, 'class');
    if (cls === 'small-caps') {
      const text = textOf(el);
      const m = text.match(/Specification\s*·\s*([0-9]+-[a-z][a-z0-9-]*)/);
      if (m) {
        specId = m[1] ?? null;
        break;
      }
    }
  }

  // <spec-meta> header fields (spec 027-git-trailers, D-002).
  const { owner, author, reviewers } = extractHeaderFields(doc);

  const fr: Requirement[] = [];
  const nfr: Requirement[] = [];
  const sc: Requirement[] = [];

  for (const req of findAll(doc.ast, 'spec-requirement')) {
    const id = getAttr(req, 'id');
    if (!id) continue;
    const priority = (getAttr(req, 'priority') ?? 'must') as 'must' | 'should' | 'may';
    const summary = oneLineSummary(textOf(req));
    const entry: Requirement = { id, priority, summary };
    if (FR_RE.test(id)) fr.push(entry);
    else if (NFR_RE.test(id)) nfr.push(entry);
    else if (SC_RE.test(id)) sc.push(entry);
  }

  return { specId, owner, author, reviewers, fr, nfr, sc };
}

/**
 * The `<spec-meta>` header fields (spec 027-git-trailers, D-002): the block is
 * alternating `<b>Label</b><span>value</span>` pairs, so zip the `<b>` labels
 * against the `<span>` values. Owner/Author/Reviewers feed the attribution
 * trailers; an absent field is null (an empty placeholder like "—" is kept
 * verbatim so the trailer gatherer can treat it as absent).
 */
function extractHeaderFields(doc: ParsedDocument): {
  owner: string | null;
  author: string | null;
  reviewers: string | null;
} {
  const metaEl = findAll(doc.ast, 'spec-meta')[0];
  if (!metaEl) return { owner: null, author: null, reviewers: null };

  const labels = findAll(metaEl, 'b').map((b) => textOf(b).trim());
  const values = findAll(metaEl, 'span').map((s) => textOf(s).trim());
  const fields: Record<string, string> = {};
  for (let i = 0; i < Math.min(labels.length, values.length); i++) {
    const label = labels[i];
    if (label) fields[label] = values[i] ?? '';
  }
  return {
    owner: fields.Owner ?? null,
    author: fields.Author ?? null,
    reviewers: fields.Reviewers ?? null,
  };
}

/**
 * The authored RICE inputs on a spec's `<spec-rice>` block (spec
 * 028-dependency-ordering, FR-003). The value score is `reach × impact ×
 * confidence ÷ effort`; consumers compute it via {@link riceValue} so the
 * arithmetic lives in one place.
 */
export interface RiceInputs {
  reach: number;
  impact: number;
  confidence: number;
  effort: number;
}

/**
 * Read the first `<spec-rice reach impact confidence effort>` block on a spec
 * into its numeric inputs, or `null` when the block is absent OR malformed
 * (any non-finite input, a negative, or `effort <= 0`). A `null` makes the spec
 * *unranked* but still orderable (028 FR-006); the `rice-well-formed` validate
 * rule separately surfaces a malformed block so the gap is loud, not silent.
 */
export function extractRice(htmlOrDoc: string | ParsedDocument): RiceInputs | null {
  const doc = typeof htmlOrDoc === 'string' ? parse(htmlOrDoc, '<inline>') : htmlOrDoc;
  const el = findAll(doc.ast, 'spec-rice')[0];
  if (!el) return null;
  const read = (name: string): number => {
    const raw = getAttr(el, name);
    return raw === undefined ? Number.NaN : Number(raw);
  };
  const reach = read('reach');
  const impact = read('impact');
  const confidence = read('confidence');
  const effort = read('effort');
  const finite = [reach, impact, confidence, effort].every((n) => Number.isFinite(n) && n >= 0);
  if (!finite || effort <= 0) return null;
  return { reach, impact, confidence, effort };
}

/** The RICE value score: `reach × impact × confidence ÷ effort`. */
export function riceValue(r: RiceInputs): number {
  return (r.reach * r.impact * r.confidence) / r.effort;
}

export type BudgetBand = 'green' | 'amber' | 'red';

export interface ArtifactHealth {
  /** `<spec-status value="…">` value, or null if absent. */
  status: string | null;
  /** FR/NFR/SC tallies — null when the artifact has no requirements (e.g. a plan). */
  reqCounts: { fr: number; nfr: number; sc: number } | null;
  /** Total `<spec-requirement>` count. */
  reqCount: number;
  /** Visible body word count, excluding `<script>`/`<style>` (mirrors spec.js). */
  wordCount: number;
  /** Estimated read time in minutes (max(1, round(words/230)), per spec.js). */
  readMinutes: number;
  /** Count of `<li>` inside `<spec-questions>`. */
  openQuestions: number;
  /** Count of `<spec-risk status="identified">` — an unresolved risk (spec FR-006). */
  risksIdentified: number;
  /** Worst budget band across words/reqs/read-time, or null if no `<spec-budget>`. */
  budgetBand: BudgetBand | null;
}

const WORDS_PER_MINUTE = 230;

/**
 * Derive a node's health from a parsed artifact (spec FR-010, plan D-004).
 *
 * The budget band is recomputed statically here because the live gauge in
 * assets/spec.js runs only in a browser; FR-010 forbids a build step, so the
 * extension cannot rely on the rendered value. The arithmetic is kept identical
 * to spec.js (§5b) and pinned by extract.health.test.ts so the two never drift.
 */
export function extractHealth(htmlOrDoc: string | ParsedDocument): ArtifactHealth {
  const doc = typeof htmlOrDoc === 'string' ? parse(htmlOrDoc, '<inline>') : htmlOrDoc;

  const status = extractSpecStatus(doc);

  let fr = 0;
  let nfr = 0;
  let sc = 0;
  const allReqs = findAll(doc.ast, 'spec-requirement');
  for (const req of allReqs) {
    const id = getAttr(req, 'id') ?? '';
    if (FR_RE.test(id)) fr++;
    else if (NFR_RE.test(id)) nfr++;
    else if (SC_RE.test(id)) sc++;
  }
  const reqCount = allReqs.length;
  const reqCounts = fr + nfr + sc > 0 ? { fr, nfr, sc } : null;

  let openQuestions = 0;
  for (const block of findAll(doc.ast, 'spec-questions')) {
    openQuestions += findAll(block, 'li').length;
  }

  let risksIdentified = 0;
  for (const risk of findAll(doc.ast, 'spec-risk')) {
    if (getAttr(risk, 'status') === 'identified') risksIdentified++;
  }

  const wordCount = countBodyWords(doc.ast);
  const readMinutes = Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));

  const budgetBand = computeBudgetBand(doc.ast, wordCount, reqCount, readMinutes);

  return {
    status,
    reqCounts,
    reqCount,
    wordCount,
    readMinutes,
    openQuestions,
    risksIdentified,
    budgetBand,
  };
}

/** Worst-of-three budget band, matching spec.js §5b exactly. */
function computeBudgetBand(
  ast: ParsedDocument['ast'],
  wordCount: number,
  reqCount: number,
  readMinutes: number,
): BudgetBand | null {
  const gauge = findAll(ast, 'spec-budget')[0];
  if (!gauge) return null;

  const wordBudget = Number(getAttr(gauge, 'words')) || 1500;
  const reqBudget = Number(getAttr(gauge, 'reqs')) || 20;
  const minBudget = Number(getAttr(gauge, 'minutes')) || 12;

  const band = (pct: number): BudgetBand => {
    if (pct <= 70) return 'green';
    if (pct <= 100) return 'amber';
    return 'red';
  };
  const rank: Record<BudgetBand, number> = { green: 0, amber: 1, red: 2 };

  const bands: BudgetBand[] = [
    band(Math.round((wordCount / wordBudget) * 100)),
    band(Math.round((reqCount / reqBudget) * 100)),
    band(Math.round((readMinutes / minBudget) * 100)),
  ];
  return bands.reduce((worst, b) => (rank[b] > rank[worst] ? b : worst), 'green');
}

/** Visible body word count, skipping <script>/<style>/<head> — matches spec.js's body.innerText. */
function countBodyWords(ast: ParsedDocument['ast']): number {
  const body = findAll(ast, 'body')[0];
  if (!body) return 0;
  const text = textExcluding(body, new Set(['script', 'style']));
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length === 0 ? 0 : collapsed.split(' ').length;
}

/** Concatenate text content of a node, skipping any subtree whose tag is excluded. */
function textExcluding(node: unknown, exclude: Set<string>): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as {
    value?: string;
    tagName?: string;
    childNodes?: ReadonlyArray<unknown>;
  };
  if (typeof n.value === 'string') return n.value;
  if (n.tagName && exclude.has(n.tagName)) return '';
  if (!n.childNodes) return '';
  return n.childNodes.map((c) => textExcluding(c, exclude)).join('');
}

function textOf(el: { childNodes?: ReadonlyArray<unknown> } | unknown): string {
  if (!el || typeof el !== 'object') return '';
  const node = el as { value?: string; childNodes?: ReadonlyArray<unknown> };
  if (typeof node.value === 'string') return node.value;
  if (!node.childNodes) return '';
  return node.childNodes.map((c) => textOf(c)).join('');
}

function oneLineSummary(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > 120 ? `${collapsed.slice(0, 117)}…` : collapsed;
}
