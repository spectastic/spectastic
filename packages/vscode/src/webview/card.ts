import type { ArtifactNode } from '../host/messaging.js';

/**
 * Compact card on hover / focus (spec FR-005): 3–5 per-verb health rows. One
 * shared card element is repositioned under whichever node is active, so density
 * stays calm (P-5) — only one card is ever visible.
 */
let cardEl: HTMLElement | null = null;
const dataById = new Map<string, ArtifactNode>();
const GAP = 8;

/** The card lives on <body> with fixed positioning so it escapes the canvas's
 * `overflow:auto` clipping — otherwise it gets cut off near the panel edges. */
function ensureCard(): HTMLElement {
  if (!cardEl) {
    cardEl = document.createElement('div');
    cardEl.className = 'compact-card';
    cardEl.hidden = true;
    document.body.appendChild(cardEl);
  }
  return cardEl;
}

export function attachCard(nodeEl: HTMLElement, node: ArtifactNode): void {
  dataById.set(node.id, node);
  if (nodeEl.dataset.cardBound === '1') return;
  nodeEl.dataset.cardBound = '1';

  const show = (): void => {
    const data = dataById.get(node.id);
    if (!data) return;
    const card = ensureCard();
    card.innerHTML = rowsHtml(data);
    card.hidden = false; // unhide first so we can measure it

    const rect = nodeEl.getBoundingClientRect();
    const ch = card.offsetHeight;
    const cw = card.offsetWidth;
    // Flip above the node if there isn't room below; clamp within the viewport.
    const top = rect.bottom + GAP + ch > window.innerHeight ? rect.top - ch - GAP : rect.bottom + GAP;
    const left = Math.max(GAP, Math.min(rect.left, window.innerWidth - cw - GAP));
    card.style.left = `${left}px`;
    card.style.top = `${Math.max(GAP, top)}px`;
  };
  const hide = (): void => {
    if (cardEl) cardEl.hidden = true;
  };

  nodeEl.addEventListener('mouseenter', show);
  nodeEl.addEventListener('mouseleave', hide);
  nodeEl.addEventListener('focus', show);
  nodeEl.addEventListener('blur', hide);
}

function rowsHtml(node: ArtifactNode): string {
  const h = node.health;
  const rows: Array<[string, string]> = [['status', h.status ?? '—']];
  if (h.reqCounts) rows.push(['reqs', `${h.reqCounts.fr}+${h.reqCounts.nfr}+${h.reqCounts.sc}`]);
  if (h.budgetBand) rows.push(['budget', h.budgetBand]);
  rows.push(['open Qs', String(h.openQuestions)]);
  if (h.risksIdentified > 0) rows.push(['risks', String(h.risksIdentified)]);
  if (node.stale) rows.push(['stale', 'yes']);

  const dl = rows
    .slice(0, 5)
    .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`)
    .join('');
  return `<dl>${dl}</dl>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
}
