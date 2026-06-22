import { VERB_ORDER, type LifecycleGraph, type Orientation } from '../host/messaging.js';

/**
 * Deterministic auto-layout (spec FR-004, plan D-003). The spine runs along the
 * primary axis ordered by the canonical verb order — vertical (top-to-bottom) by
 * default, or horizontal (left-to-right) — and child slices branch onto a lane on
 * the perpendicular axis, aligned with their parent. Pure — no DOM, no deps.
 */

export const NODE_W = 184;
export const NODE_H = 76;
const GAP_X = 48;
const GAP_Y = 28;
const PAD = 28;

export interface NodePos {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layout {
  positions: NodePos[];
  width: number;
  height: number;
}

const isSlice = (id: string): boolean => id.startsWith('slice:');

export function layoutGraph(graph: LifecycleGraph, orientation: Orientation = 'vertical'): Layout {
  const vertical = orientation === 'vertical';
  // Step along the primary axis; the perpendicular axis is the lane direction.
  const spineStep = vertical ? NODE_H + GAP_Y : NODE_W + GAP_X;
  const laneStep = vertical ? NODE_W + GAP_X : NODE_H + GAP_Y;

  const positions: NodePos[] = [];

  const spine = graph.nodes
    .filter((n) => !isSlice(n.id))
    .slice()
    .sort((a, b) => VERB_ORDER.indexOf(a.verb) - VERB_ORDER.indexOf(b.verb));

  const posByVerb = new Map<string, NodePos>();
  spine.forEach((n, i) => {
    const primary = PAD + i * spineStep;
    const pos: NodePos = {
      id: n.id,
      x: vertical ? PAD : primary,
      y: vertical ? primary : PAD,
      w: NODE_W,
      h: NODE_H,
    };
    posByVerb.set(n.verb, pos);
    positions.push(pos);
  });

  // Slices branch perpendicular to the spine, aligned with their parent.
  const laneCount = new Map<string, number>();
  for (const slice of graph.nodes.filter((n) => isSlice(n.id))) {
    const parentEdge = graph.edges.find((e) => e.to === slice.id && e.kind === 'slice');
    const parent = parentEdge ? posByVerb.get(parentEdge.from) : undefined;
    const baseX = parent?.x ?? PAD;
    const baseY = parent?.y ?? PAD;
    const depth = laneCount.get(parentEdge?.from ?? '') ?? 0;
    laneCount.set(parentEdge?.from ?? '', depth + 1);
    positions.push({
      id: slice.id,
      // vertical spine → lane to the right (offset x); horizontal spine → lane below (offset y).
      x: vertical ? baseX + laneStep + depth * spineStep : baseX,
      y: vertical ? baseY + depth * spineStep : baseY + laneStep + depth * spineStep,
      w: NODE_W,
      h: NODE_H,
    });
  }

  const width = positions.reduce((m, p) => Math.max(m, p.x + p.w), 0) + PAD;
  const height = positions.reduce((m, p) => Math.max(m, p.y + p.h), 0) + PAD;
  return { positions, width, height };
}
