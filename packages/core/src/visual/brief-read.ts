/**
 * The complete reader (spec 107-visual-design-brief, T-110, FR-001, D-004).
 *
 * `projectScreens` (materialise-view.ts) is deliberately not reused here — it
 * takes a `rowBudget` and truncates, and its `ProjectedScreen` carries no
 * refusal, no annotation `aria-state`/`cites`, and no addressed/declined
 * contexts. FR-001 requires every declared state, refusal, annotation and
 * context to reach the brief, so a truncating model cannot be the source.
 * This is its own reader, following the precedent `screen-naming.ts:83-85`
 * already set: read declarations directly rather than widen the view's
 * model, which keeps the view's shape owned by the view.
 *
 * A note on `parseAxisContextPairs` (from `@spectastic/schema/variant-grid`):
 * it is NOT used here. It returns `Record<axis, context>` — one value per
 * axis — so a `contexts=` claim addressing more than one context on the same
 * axis (the real exemplar's own `mode=light mode=dark …`) would silently
 * lose everything but the last. `coverage.ts` calls it on a whole `contexts=`
 * string the same way and inherits the same bug; that is pre-existing and out
 * of this task's scope, flagged rather than touched. The addressed-contexts
 * list here is read as plain space-separated tokens instead, since a brief
 * only needs to DISPLAY them, never resolve them against a grid.
 */

import { findAll, getAttr, parse } from '@spectastic/schema/parser';
import type { Element } from '@spectastic/schema/parser';
import {
  ANNOTATION_ELEMENT,
  REFUSAL_ELEMENT,
  SCREEN_ELEMENT,
  STATE_ELEMENT,
} from '@spectastic/schema/visual-vocabulary';
import { readVariantGrid } from '@spectastic/schema/variant-grid';
import type { FileSystem } from '../types.js';

export interface BriefState {
  id: string;
  source: string;
  from: string | undefined;
}

export interface BriefAnnotation {
  target: string | undefined;
  layer: string | undefined;
  role: string | undefined;
  ariaState: string | undefined;
  cites: string | undefined;
}

export interface BriefRefusal {
  text: string;
  context: string | undefined;
  body: string;
}

export interface BriefScreen {
  id: string;
  states: BriefState[];
  annotations: BriefAnnotation[];
}

export interface BriefDeclinedContext {
  axis: string;
  context: string;
  reason: string;
}

export interface BriefModel {
  screens: BriefScreen[];
  /** Document-scoped, not per-screen — the real exemplar declares them once
   *  under their own section, not nested inside any one <spec-screen>. */
  refusals: BriefRefusal[];
  /** Raw `axis=context` tokens, in authored order. May address the same axis
   *  more than once (see the module doc on parseAxisContextPairs). */
  addressedContexts: string[];
  declinedContexts: BriefDeclinedContext[];
}

/** An element's own direct text content, excluding nested element text —
 *  the same shape as variant-grid.ts's unexported reasonOf(). */
function textOf(el: Element): string {
  let out = '';
  for (const child of el.childNodes ?? []) {
    const node = child as { nodeName?: string; value?: string };
    if (node.nodeName === '#text' && typeof node.value === 'string') out += node.value;
  }
  // Collapse the line-wrap whitespace the HTML source uses for readability —
  // real, observed defect (found by opening a generated brief, not by
  // reading this code): without this, a wrapped sentence in the source
  // carries its mid-sentence line break straight into the brief.
  return normalizeWhitespace(out);
}

/** Collapse any run of whitespace (including newlines and source indentation)
 *  to a single space, and trim. Applied to every piece of prose lifted
 *  verbatim from an artifact into the brief — a refusal's body and a
 *  declined context's reason both come from HTML authored with line wraps
 *  for the source's own readability, not the brief's. */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

async function readScreenFiles(screensPath: string, fs: FileSystem, cwd: string): Promise<string[]> {
  const full = `${cwd}/${screensPath}`;
  try {
    const stat = await fs.stat(full);
    if (!stat.isDirectory) return [await fs.readFile(full)];
    const names = (await fs.readdir(full)).filter((f) => f.endsWith('.html'));
    return Promise.all(names.map((n) => fs.readFile(`${full}/${n}`)));
  } catch {
    return [];
  }
}

/** One screen file's contribution: its screens (with states and nested
 *  annotations) and its document-scoped refusals. */
function readScreenDocument(html: string, file: string): { screens: BriefScreen[]; refusals: BriefRefusal[] } {
  const doc = parse(html, file);

  const screens = findAll(doc.ast, SCREEN_ELEMENT).map((screenEl) => ({
    id: getAttr(screenEl, 'id') ?? '',
    states: readStates(screenEl),
    annotations: findAll(screenEl, ANNOTATION_ELEMENT).map(readAnnotation),
  }));

  // Document-scoped: read once against the whole document, not nested under
  // any one screen — the real exemplar declares refusals under their own
  // section, not inside a <spec-screen>.
  const refusals = findAll(doc.ast, REFUSAL_ELEMENT).map((refusalEl) => ({
    text: getAttr(refusalEl, 'text') ?? '',
    context: getAttr(refusalEl, 'context'),
    body: textOf(refusalEl),
  }));

  return { screens, refusals };
}

function readStates(screenEl: Element): BriefState[] {
  return findAll(screenEl, STATE_ELEMENT).map((stateEl) => ({
    id: getAttr(stateEl, 'id') ?? '',
    source: getAttr(stateEl, 'source') ?? '',
    from: getAttr(stateEl, 'from'),
  }));
}

function readAnnotation(annoEl: Element): BriefAnnotation {
  return {
    target: getAttr(annoEl, 'target'),
    layer: getAttr(annoEl, 'layer'),
    role: getAttr(annoEl, 'role'),
    ariaState: getAttr(annoEl, 'aria-state'),
    cites: getAttr(annoEl, 'cites'),
  };
}

/** Every declined context across every axis, `[]` when the grid can't be
 *  read — an unreadable grid is the resolve scan's finding, not this
 *  reader's, so a brief with no context section is the honest degrade. */
async function readDeclinedContexts(
  variantsPath: string | undefined,
  fs: FileSystem,
  cwd: string,
): Promise<BriefDeclinedContext[]> {
  if (variantsPath === undefined) return [];
  try {
    const html = await fs.readFile(`${cwd}/${variantsPath}`);
    const grid = readVariantGrid(parse(html, variantsPath));
    const declined: BriefDeclinedContext[] = [];
    for (const axis of grid.axes) {
      if (axis.name === undefined) continue;
      for (const ctx of axis.contexts) {
        if (ctx.name === undefined || !ctx.declined) continue;
        declined.push({ axis: axis.name, context: ctx.name, reason: normalizeWhitespace(ctx.reason) });
      }
    }
    return declined;
  } catch {
    return [];
  }
}

/**
 * Read a feature's complete brief model from its design and declared
 * screens. `designHtml` is already-read content (the caller reads it, the
 * same shape `projectScreens` takes html directly rather than a path).
 */
export async function readBriefModel(designHtml: string, fs: FileSystem, cwd: string): Promise<BriefModel> {
  const visualEl = findAll(parse(designHtml, 'design.html').ast, 'spec-visual')[0];

  const screensPath = visualEl ? getAttr(visualEl, 'screens') : undefined;
  const documents =
    screensPath === undefined
      ? []
      : (await readScreenFiles(screensPath, fs, cwd)).map((html) => readScreenDocument(html, screensPath));

  const rawContexts = visualEl ? getAttr(visualEl, 'contexts') : undefined;
  const addressedContexts = rawContexts === undefined ? [] : rawContexts.trim().split(/\s+/).filter(Boolean);

  return {
    screens: documents.flatMap((d) => d.screens),
    refusals: documents.flatMap((d) => d.refusals),
    addressedContexts,
    declinedContexts: await readDeclinedContexts(visualEl ? getAttr(visualEl, 'variants') : undefined, fs, cwd),
  };
}
