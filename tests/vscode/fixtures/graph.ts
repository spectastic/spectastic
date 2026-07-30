// Shared LifecycleGraph fixtures for the canvas Playwright specs. Mirrors the
// shape produced by the host scanner (packages/vscode/src/host/messaging.ts).

declare global {
  interface Window {
    __posted: Array<{ type: string; [key: string]: unknown }>;
  }
}

export const SAMPLE_GRAPH = {
  specId: '099-demo',
  nodes: [
    mkNode('spec', 'spec', '099-demo', { reqCount: 14, status: 'review' }, { metric: '14 reqs' }),
    mkNode('plan', 'plan', '099-demo', { status: 'draft' }, { metric: 'draft' }),
    mkNode(
      'tasks',
      'tasks',
      '099-demo',
      { status: 'draft' },
      {
        metric: 'draft',
        attention: true, // e.g. open questions
      },
    ),
    mkNode(
      'slice:099a',
      'spec',
      '099a-child',
      { reqCount: 5, status: 'draft' },
      {
        metric: '5 reqs',
      },
    ),
  ],
  edges: [
    { from: 'spec', to: 'plan', kind: 'flow' },
    { from: 'plan', to: 'tasks', kind: 'flow' },
    { from: 'spec', to: 'slice:099a', kind: 'slice' },
  ],
};

export const EMPTY_GRAPH = { specId: '099-demo', nodes: [], edges: [] };

export const UNKNOWN_GRAPH = {
  specId: '099-demo',
  nodes: [mkNode('spec', 'spec', '099-demo', {}, { metric: 'unknown', unknown: true })],
  edges: [],
};

function mkNode(
  id: string,
  verb: string,
  specId: string,
  health: Record<string, unknown>,
  extra: Record<string, unknown>,
) {
  return {
    id,
    verb,
    specId,
    title: specId,
    path: `/repo/specs/${specId}/${verb}.html`,
    health: {
      status: null,
      reqCounts: null,
      reqCount: 0,
      wordCount: 0,
      readMinutes: 0,
      openQuestions: 0,
      risksIdentified: 0,
      budgetBand: null,
      ...health,
    },
    metric: '—',
    attention: false,
    stale: false,
    unknown: false,
    ...extra,
  };
}
