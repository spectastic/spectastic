import './canvas.css';
import type { ArtifactNode, HostMessage, LifecycleGraph, Orientation, WebviewMessage } from '../host/messaging.js';
import { attachCard } from './card.js';
import { renderEdges } from './edges.js';
import { layoutGraph, type NodePos } from './layout.js';
import { renderNode, updateNode } from './node.js';
import { renderEmpty } from './states.js';
import { applyTheme, watchTheme } from './theme.js';

/**
 * Canvas webview entry (spec FR-001). Receives a LifecycleGraph (or patch) from
 * the host, lays it out, and reconciles the DOM by node id so live updates land
 * without a full-canvas teardown (NFR-002, no flicker). Vanilla TS, no framework
 * (plan D-002).
 */
interface VsCodeApi {
  postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

const api: VsCodeApi | null = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
const post = (message: WebviewMessage): void => api?.postMessage(message);

const nodeEls = new Map<string, HTMLElement>();
let surface: HTMLElement | null = null;

function root(): HTMLElement {
  let el = document.getElementById('canvas-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'canvas-root';
    document.body.appendChild(el);
  }
  return el;
}

function render(graph: LifecycleGraph, orientation: Orientation = 'vertical'): void {
  const host = root();
  const layout = layoutGraph(graph, orientation);

  if (!surface?.isConnected) {
    surface = document.createElement('div');
    surface.className = 'canvas-surface';
    host.replaceChildren(surface);
    nodeEls.clear();
  }
  surface.style.width = `${layout.width}px`;
  surface.style.height = `${layout.height}px`;

  const edges = renderEdges(graph, layout);
  const existing = surface.querySelector('svg.edges');
  if (existing) existing.replaceWith(edges);
  else surface.prepend(edges);

  const posById = new Map<string, NodePos>(layout.positions.map((p) => [p.id, p]));
  const seen = new Set<string>();

  for (const node of graph.nodes) {
    const pos = posById.get(node.id);
    if (!pos) continue;
    seen.add(node.id);
    let el = nodeEls.get(node.id);
    if (el) {
      updateNode(el, node, pos);
    } else {
      el = renderNode(node, pos, (path) => post({ type: 'open', path }));
      surface.appendChild(el);
      nodeEls.set(node.id, el);
    }
    attachCard(el, node);
  }

  for (const [id, el] of nodeEls) {
    if (!seen.has(id)) {
      el.remove();
      nodeEls.delete(id);
    }
  }
}

function patch(node: ArtifactNode): void {
  const el = nodeEls.get(node.id);
  if (!el) return;
  updateNode(el, node, readPos(el));
  attachCard(el, node);
}

function readPos(el: HTMLElement): NodePos {
  return {
    id: el.dataset.id ?? '',
    x: el.offsetLeft,
    y: el.offsetTop,
    w: el.offsetWidth,
    h: el.offsetHeight,
  };
}

function showEmpty(reason: string): void {
  surface = null;
  nodeEls.clear();
  root().replaceChildren(renderEmpty(reason));
}

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const msg = event.data;
  if (!msg) return;
  switch (msg.type) {
    case 'graph':
      if (msg.graph.nodes.length === 0) showEmpty('This spec has no lifecycle artifacts yet.');
      else render(msg.graph, msg.orientation ?? 'vertical');
      break;
    case 'patch':
      patch(msg.node);
      break;
    case 'empty':
      showEmpty(msg.reason);
      break;
  }
});

applyTheme(document.documentElement);
watchTheme(document.documentElement);
post({ type: 'ready' });
