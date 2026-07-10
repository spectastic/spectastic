import { describe, expect, it } from 'vitest';
import { buildRunSteps } from '../src/run/steps.js';
import type { CodingAgent } from '../src/coding/types.js';
import type { AIProvider } from '../src/types.js';

/**
 * 037 — structural coverage of the real step wiring. The driver's logic is
 * unit-tested in run-pipeline.test.ts; here we assert the real steps are the
 * ordered plan→tasks→implement→verify chain with the decision verbs wired to the
 * two generation steps. The end-to-end real-generation run is a local smoke.
 */

const noop = {} as unknown;

describe('buildRunSteps — the real step chain (037)', () => {
  const steps = buildRunSteps('999-x', {
    cwd: '/tmp/x',
    fs: noop as never,
    ai: noop as AIProvider,
    coding: noop as CodingAgent,
    sandbox: noop as never,
    verify: noop as never,
  });

  it('is the plan→tasks→implement→verify chain, in order', () => {
    expect(steps.map((s) => s.name)).toEqual(['plan', 'tasks', 'implement', 'verify']);
  });

  it('wires the 039 decision verbs to the generation steps only', () => {
    expect(steps.find((s) => s.name === 'plan')?.decisionVerb).toBe('plan');
    expect(steps.find((s) => s.name === 'tasks')?.decisionVerb).toBe('tasks');
    expect(steps.find((s) => s.name === 'implement')?.decisionVerb).toBeUndefined();
    expect(steps.find((s) => s.name === 'verify')?.decisionVerb).toBeUndefined();
  });
});
