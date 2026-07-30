import { type ArtifactNode, VERB_TOKEN } from '../host/messaging.js';
import type { NodePos } from './layout.js';

/**
 * Minimal-node DOM (spec FR-002): verb dot in the fixed 017 brand colour, title,
 * status pill, and one key metric. Click opens the artifact (FR-003, dispatch
 * added in T-211). Needs-attention / stale / unknown states ride on data-*
 * attributes styled in canvas.css (FR-006/FR-007, quiet until fired).
 */
export type OpenHandler = (path: string) => void;

export function renderNode(node: ArtifactNode, pos: NodePos, onOpen: OpenHandler): HTMLElement {
  const el = document.createElement('div');
  el.className = 'node';
  el.dataset.id = node.id;
  el.dataset.verb = node.verb;
  el.tabIndex = 0;
  el.setAttribute('role', 'button');

  el.innerHTML = `
    <span class="verb-dot"></span>
    <div class="ncontent">
      <span class="verb-label"></span>
      <span class="title"></span>
      <div class="nmeta"><span class="pill"></span> <span class="metric"></span></div>
    </div>`;

  // Read the path from the element at click time, not a render-time closure:
  // the node is reused (reconciled by id) across spec switches, so the closed-
  // over node.path would stay stale and open the previous spec's file.
  const open = (): void => {
    const p = el.dataset.path;
    if (p) onOpen(p);
  };
  el.addEventListener('click', open);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });

  updateNode(el, node, pos);
  return el;
}

/** Reconcile an existing node element in place — no teardown, so no flicker (NFR-002). */
export function updateNode(el: HTMLElement, node: ArtifactNode, pos: NodePos): void {
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;
  el.style.width = `${pos.w}px`;
  // Floor, not a fixed height — the box grows to fit its content so a wrapping
  // title or extra row never overspills the border (and the ring isn't cropped).
  el.style.minHeight = `${pos.h}px`;
  el.style.position = 'absolute';
  // Derived-view nodes (FR-014) sit outside the fixed verb palette (FR-002): a
  // muted, non-verb colour rather than VERB_TOKEN[verb].
  el.style.setProperty('--verb-color', node.derived ? 'var(--c-muted)' : `var(${VERB_TOKEN[node.verb]})`);

  el.dataset.path = node.path;
  el.dataset.derived = String(Boolean(node.derived));
  el.dataset.attention = String(node.attention);
  el.dataset.stale = String(node.stale);
  el.dataset.unknown = String(node.unknown);
  el.setAttribute('aria-label', ariaLabel(node));

  setText(el, '.verb-label', node.derived ? node.id : node.verb);
  setText(el, '.title', node.title);
  setText(el, '.metric', node.metric);

  const pill = el.querySelector<HTMLElement>('.pill');
  if (pill) {
    // A derived view has no lifecycle status of its own (FR-014) — never a pill.
    const status = node.derived ? null : node.health.status;
    pill.textContent = status ?? '';
    pill.hidden = !status;
    if (status) pill.dataset.status = status;
  }
}

function ariaLabel(node: ArtifactNode): string {
  const bits = [node.verb, node.title, node.health.status ?? '', node.metric];
  if (node.attention) bits.push('needs attention');
  if (node.stale) bits.push('stale');
  if (node.unknown) bits.push('unknown');
  return bits.filter(Boolean).join(', ');
}

function setText(el: HTMLElement, selector: string, text: string): void {
  const target = el.querySelector(selector);
  if (target) target.textContent = text;
}
