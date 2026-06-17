/**
 * Structured metadata extraction from a parsed spec-html document.
 *
 * Per D-006 of specs/009-core-tasks/plan.html: surfaces the FR/NFR/SC
 * IDs + priorities + summaries so the kernel's tasks command can
 * map requirements to phases + assert traceability without re-parsing.
 *
 * First @spectastic/schema API surface extension by a sibling slice.
 * Pre-1.0 minor bump (consumers should pin tightly).
 */

import { parse } from './parser.js';
import { findAll, getAttr } from './parser.js';
import type { ParsedDocument } from './types.js';

export interface Requirement {
  id: string;
  priority: 'must' | 'should' | 'may';
  summary: string;
}

export interface SpecMetadata {
  /** Spec ID extracted from <p class="small-caps">Specification · <id></p>. */
  specId: string | null;
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

  return { specId, fr, nfr, sc };
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
