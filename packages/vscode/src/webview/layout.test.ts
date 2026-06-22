import { describe, it, expect } from 'vitest';
import { layoutGraph } from './layout.js';
import type { ArtifactNode, LifecycleGraph } from '../host/messaging.js';

function node(id: string, verb: ArtifactNode['verb'], specId = '099-demo'): ArtifactNode {
  return {
    id,
    verb,
    specId,
    title: specId,
    path: `/x/${id}.html`,
    health: {
      status: null,
      reqCounts: null,
      reqCount: 0,
      wordCount: 0,
      readMinutes: 0,
      openQuestions: 0,
      risksIdentified: 0,
      budgetBand: null,
    },
    metric: '—',
    attention: false,
    stale: false,
    unknown: false,
  };
}

const graph: LifecycleGraph = {
  specId: '099-demo',
  nodes: [
    node('plan', 'plan'),
    node('spec', 'spec'),
    node('tasks', 'tasks'),
    node('slice:099a', 'spec', '099a-child'),
  ],
  edges: [
    { from: 'spec', to: 'plan', kind: 'flow' },
    { from: 'plan', to: 'tasks', kind: 'flow' },
    { from: 'spec', to: 'slice:099a', kind: 'slice' },
  ],
};

describe('layoutGraph — vertical (default, FR-004)', () => {
  const layout = layoutGraph(graph);
  const pos = (id: string) => layout.positions.find((p) => p.id === id)!;

  it('stacks the spine top-to-bottom by canonical verb order, not input order', () => {
    expect(pos('spec').y).toBeLessThan(pos('plan').y);
    expect(pos('plan').y).toBeLessThan(pos('tasks').y);
  });

  it('places the spine in a single column', () => {
    expect(pos('spec').x).toBe(pos('plan').x);
    expect(pos('plan').x).toBe(pos('tasks').x);
  });

  it('drops a child slice onto a lane right of its parent, aligned in y', () => {
    expect(pos('slice:099a').x).toBeGreaterThan(pos('spec').x);
    expect(pos('slice:099a').y).toBe(pos('spec').y);
  });

  it('reports a canvas large enough to contain every node', () => {
    for (const p of layout.positions) {
      expect(layout.width).toBeGreaterThanOrEqual(p.x + p.w);
      expect(layout.height).toBeGreaterThanOrEqual(p.y + p.h);
    }
  });

  it('is deterministic — same input, same output', () => {
    expect(layoutGraph(graph)).toEqual(layout);
  });
});

describe('layoutGraph — horizontal (opt-in)', () => {
  const layout = layoutGraph(graph, 'horizontal');
  const pos = (id: string) => layout.positions.find((p) => p.id === id)!;

  it('orders the spine left-to-right by canonical verb order', () => {
    expect(pos('spec').x).toBeLessThan(pos('plan').x);
    expect(pos('plan').x).toBeLessThan(pos('tasks').x);
  });

  it('places the spine on a single row', () => {
    expect(pos('spec').y).toBe(pos('plan').y);
    expect(pos('plan').y).toBe(pos('tasks').y);
  });

  it('drops a child slice onto a lane below its parent, aligned in x', () => {
    expect(pos('slice:099a').y).toBeGreaterThan(pos('spec').y);
    expect(pos('slice:099a').x).toBe(pos('spec').x);
  });
});
