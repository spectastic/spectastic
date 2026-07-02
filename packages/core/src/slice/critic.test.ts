import { describe, it, expect } from 'vitest';
import { runCoverageCritic } from './critic.js';
import { sliceCommand } from '../commands/slice.js';
import { sliceStub } from './stub-ai.js';
import type { CandidateChild } from './types.js';

/**
 * US2 (T-211): the semantic coverage critic (FR-006). Parses the subagent verdict
 * and wires it into the coverage report + the rendered proposal.
 */

function child(specId: string, ids: string[]): CandidateChild {
  return {
    specId,
    title: specId,
    scope: '',
    assignedRequirementIds: ids,
    dependsOn: [],
    rice: { reach: 1, impact: 1, confidence: 1, effort: 1 },
    riceConfirmed: true,
  };
}

describe('runCoverageCritic', () => {
  it('parses the critic subagent verdict', async () => {
    const ai = sliceStub({ agents: ['{"ok":false,"notes":["child 002 is a horizontal layer"]}'] });
    const v = await runCoverageCritic('<html></html>', [child('001-a', ['FR-001'])], { cwd: '.', ai });
    expect(v?.ok).toBe(false);
    expect(v?.notes).toContain('child 002 is a horizontal layer');
  });

  it('returns undefined on non-JSON critic output', async () => {
    const ai = sliceStub({ agents: ['not json at all'] });
    const v = await runCoverageCritic('<html></html>', [child('001-a', ['FR-001'])], { cwd: '.', ai });
    expect(v).toBeUndefined();
  });
});

describe('sliceCommand with the critic (default on)', () => {
  const decomposition = {
    children: [
      { specId: '030-a', title: 'A', scope: 'FR-001', assignedRequirementIds: ['FR-001'], dependsOn: [], rice: { reach: 5, impact: 5, confidence: 1, effort: 1 } },
      { specId: '031-b', title: 'B', scope: 'FR-002', assignedRequirementIds: ['FR-002'], dependsOn: ['030-a'], rice: { reach: 2, impact: 2, confidence: 1, effort: 1 } },
    ],
  };
  const parentHtml = `<main><spec-requirement id="FR-001" priority="must"><p>a</p></spec-requirement><spec-requirement id="FR-002" priority="must"><p>b</p></spec-requirement></main>`;

  it('attaches the semantic verdict to coverage and renders it', async () => {
    const ai = sliceStub({
      decompositions: [decomposition],
      confirmations: [{ RICE: 'Accept' }],
      agents: ['{"ok":true,"notes":["clean vertical slices"]}'],
    });
    const res = await sliceCommand({ parentSpecId: '029', parentHtml }, { cwd: '.', ai });
    expect(res.model.coverage.semantic?.ok).toBe(true);
    expect(res.splitSection).toContain('Semantic check:');
  });
});
