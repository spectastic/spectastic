import type { LifecycleGraph } from '../host/messaging.js';
import type { Layout, NodePos } from './layout.js';

/**
 * Render the flow/slice/proposal edges as a single SVG layer (spec FR-004).
 * Curved connectors join node right-edge → next node left-edge; slice edges drop
 * from a parent's bottom to a lane node's top. Colour/branch styling lives in
 * canvas.css keyed by data-kind.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

export function renderEdges(graph: LifecycleGraph, layout: Layout): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'edges');
  svg.setAttribute('width', String(layout.width));
  svg.setAttribute('height', String(layout.height));

  const byId = new Map<string, NodePos>(layout.positions.map((p) => [p.id, p]));

  for (const edge of graph.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('data-kind', edge.kind);
    // Geometry-driven: connect along whichever axis separates the two nodes, so
    // the same code serves vertical and horizontal orientations (spec FR-004).
    path.setAttribute('d', connector(from, to));
    svg.appendChild(path);
  }
  return svg;
}

/** Centre-to-centre S-curve, entering/leaving on the dominant axis between the nodes. */
function connector(from: NodePos, to: NodePos): string {
  const fc = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const tc = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const horizontal = Math.abs(tc.x - fc.x) >= Math.abs(tc.y - fc.y);

  if (horizontal) {
    const x1 = fc.x < tc.x ? from.x + from.w : from.x;
    const x2 = fc.x < tc.x ? to.x : to.x + to.w;
    const mid = (x1 + x2) / 2;
    return `M ${x1} ${fc.y} C ${mid} ${fc.y}, ${mid} ${tc.y}, ${x2} ${tc.y}`;
  }
  const y1 = fc.y < tc.y ? from.y + from.h : from.y;
  const y2 = fc.y < tc.y ? to.y : to.y + to.h;
  const mid = (y1 + y2) / 2;
  return `M ${fc.x} ${y1} C ${fc.x} ${mid}, ${tc.x} ${mid}, ${tc.x} ${y2}`;
}
