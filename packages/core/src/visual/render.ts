/**
 * Reading `<spec-render>` declarations out of a screen sidecar
 * (099-visual-embedded-view, FR-008, design D-004).
 *
 * Pure: no filesystem, no clock, no network. The caller supplies parsed HTML.
 *
 * Borrows the `axis=context` GRAMMAR from the variant grid and none of its
 * resolution — the same split the coverage check had to make, and for the same
 * reason: resolving a context needs the grid, which is a different file.
 */

import { parseAxisContextPairs } from '@spectastic/schema/variant-grid';
import { findAll, getAttr } from '@spectastic/schema/parser';
import { RENDER_ELEMENT, STATE_ELEMENT } from '@spectastic/schema/visual-vocabulary';

export interface DeclaredRender {
  /** Project-relative path to the committed image. Never resolved here. */
  src: string;
  /** The state this render is evidence of, from the element it sits inside.
   *  `undefined` when it sits directly on the screen. */
  state: string | undefined;
  /** axis → context, as authored. Empty when the render names no cell beyond
   *  its state, which is legal (FR-008). */
  contexts: Record<string, string>;
}

/**
 * Every render in a screen document, in source order.
 *
 * State comes from POSITION rather than an attribute (design D-004): a render
 * nested in a state is evidence of that state. One fewer attribute to get
 * wrong, and it cannot disagree with where it sits.
 */
export function readRenders(doc: unknown): DeclaredRender[] {
  const root = (doc as { ast?: unknown }).ast ?? doc;
  const out: DeclaredRender[] = [];

  // Walk states first so a nested render learns its state, then pick up any
  // render that sits directly on the screen.
  const claimed = new Set<unknown>();
  for (const state of findAll(root as never, STATE_ELEMENT)) {
    const id = getAttr(state, 'id');
    for (const el of findAll(state, RENDER_ELEMENT)) {
      claimed.add(el);
      const src = getAttr(el, 'src');
      if (src === undefined || src.trim() === '') continue; // the shape rule reports it
      out.push({ src, state: id, contexts: parseAxisContextPairs(getAttr(el, 'contexts') ?? '') });
    }
  }
  for (const el of findAll(root as never, RENDER_ELEMENT)) {
    if (claimed.has(el)) continue;
    const src = getAttr(el, 'src');
    if (src === undefined || src.trim() === '') continue;
    out.push({ src, state: undefined, contexts: parseAxisContextPairs(getAttr(el, 'contexts') ?? '') });
  }
  return out;
}

/**
 * Alternative text for a render, derived from what it is evidence of rather
 * than authored separately (P-13). A second authored string would be a second
 * thing to drift, and an empty alt on a figure that carries meaning is a
 * conformance failure.
 */
export function renderAltText(r: DeclaredRender, screenId: string): string {
  const cell = Object.entries(r.contexts)
    .map(([axis, ctx]) => `${axis} ${ctx}`)
    .join(', ');
  const parts = [`${screenId} screen`];
  if (r.state !== undefined) parts.push(`in the ${r.state} state`);
  if (cell !== '') parts.push(`(${cell})`);
  return parts.join(' ');
}
