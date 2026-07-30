import { describe, expect, it } from 'vitest';
import type { AIProvider, ChatOpts, Question, SubagentOpts, SubagentResult } from '../types.js';
import { panelScore } from './panel.js';
import { decomposeRivals, selectBestDecomposition } from './rivals.js';
import { sliceStub } from './stub-ai.js';
import type { CandidateChild, Decomposition } from './types.js';

/**
 * US3 (T-300): the bias-resistant ranking panel (median resists an outlier judge,
 * NFR-001 / D-006) and rival-decomposition selection (a covering decomposition
 * wins; FR-009).
 */

function child(specId: string, rice: [number, number, number, number], ids: string[] = []): CandidateChild {
  return {
    specId,
    title: specId,
    scope: '',
    assignedRequirementIds: ids,
    dependsOn: [],
    rice: {
      reach: rice[0],
      impact: rice[1],
      confidence: rice[2],
      effort: rice[3],
    },
    riceConfirmed: true,
  };
}

describe('panelScore', () => {
  it('takes the median, so a single outlier scorer cannot swing a score', async () => {
    const ai = sliceStub({
      agents: [
        '{"001-a":{"reach":5,"impact":5,"confidence":1,"effort":1}}',
        '{"001-a":{"reach":5,"impact":5,"confidence":1,"effort":1}}',
        '{"001-a":{"reach":0,"impact":0,"confidence":1,"effort":1}}',
      ],
    });
    const scored = await panelScore([child('001-a', [3, 3, 1, 1])], { cwd: '.', ai }, 3);
    expect(scored[0]!.rice.reach).toBe(5); // median([5,5,0]) = 5
  });

  it('keeps the estimate when a child gets no valid votes', async () => {
    const ai = sliceStub({ agents: ['{}', '{}', '{}'] });
    const scored = await panelScore([child('001-a', [3, 3, 1, 1])], { cwd: '.', ai }, 3);
    expect(scored[0]!.rice.reach).toBe(3);
  });
});

/** A scorer stub that counts invocations + peak concurrency (spec 035). */
class ScoreStub implements AIProvider {
  readonly model = 'stub-score';
  public calls = 0;
  private inFlight = 0;
  public peak = 0;
  constructor(
    private readonly score: string,
    private readonly delayMs = 0,
  ) {}
  async chat(_p: string, _o?: ChatOpts): Promise<string> {
    return '{}';
  }
  async ask<T extends Record<string, string>>(_q: ReadonlyArray<Question>): Promise<T> {
    return {} as T;
  }
  async subagent(_p: string, _o?: SubagentOpts): Promise<SubagentResult> {
    this.calls += 1;
    this.inFlight += 1;
    this.peak = Math.max(this.peak, this.inFlight);
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    this.inFlight -= 1;
    return { output: this.score };
  }
}

describe('panelScore · Decider adoption (035)', () => {
  const SCORE = '{"001-a":{"reach":3,"impact":3,"confidence":1,"effort":1}}';

  it('default sizes to 3 scorers via the high floor (SC-001/SC-002, FR-002)', async () => {
    const ai = new ScoreStub(SCORE);
    await panelScore([child('001-a', [3, 3, 1, 1])], { cwd: '.', ai });
    expect(ai.calls).toBe(3);
  });

  it('effort=max sizes to 5 scorers (SC-001, FR-001)', async () => {
    const ai = new ScoreStub(SCORE);
    await panelScore([child('001-a', [3, 3, 1, 1])], { cwd: '.', ai }, { effort: 'max' });
    expect(ai.calls).toBe(5);
  });

  it('an explicit count still wins (FR-006, 029 back-compat)', async () => {
    const ai = new ScoreStub(SCORE);
    await panelScore([child('001-a', [3, 3, 1, 1])], { cwd: '.', ai }, 2);
    expect(ai.calls).toBe(2);
  });

  it('scorers run concurrently, not serially (SC-003, FR-004)', async () => {
    const ai = new ScoreStub(SCORE, 20);
    await panelScore([child('001-a', [3, 3, 1, 1])], { cwd: '.', ai });
    expect(ai.peak).toBeGreaterThan(1);
  });
});

describe('rival decompositions', () => {
  const parent = `<main><spec-requirement id="FR-001" priority="must"><p>a</p></spec-requirement><spec-requirement id="FR-002" priority="must"><p>b</p></spec-requirement></main>`;

  it('selects a covering decomposition over an incomplete higher-value one', () => {
    const covering: Decomposition = {
      children: [child('001-a', [1, 1, 1, 1], ['FR-001']), child('002-b', [1, 1, 1, 1], ['FR-002'])],
    };
    const incomplete: Decomposition = {
      children: [child('003-c', [9, 9, 1, 1], ['FR-001'])],
    };
    expect(selectBestDecomposition([incomplete, covering], parent)).toBe(covering);
  });

  it('parses rivals from chat and bounds to max', async () => {
    const ai = sliceStub({
      decompositions: [
        {
          decompositions: [
            {
              children: [
                {
                  specId: '001-a',
                  title: 'A',
                  scope: '',
                  assignedRequirementIds: ['FR-001'],
                  dependsOn: [],
                  rice: { reach: 1, impact: 1, confidence: 1, effort: 1 },
                },
              ],
            },
            { children: [] },
            { children: [] },
          ],
        },
      ],
    });
    const rivals = await decomposeRivals(parent, { cwd: '.', ai }, 2);
    expect(rivals).toHaveLength(2);
  });
});
