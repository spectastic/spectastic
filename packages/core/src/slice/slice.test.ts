import { describe, expect, it } from 'vitest';
import { appendSplitToParent, sliceCommand, splitProposalIntent } from '../commands/slice.js';
import { sliceStub } from './stub-ai.js';

/**
 * US1 (T-101): orchestration. `sliceCommand` on an over-budget Draft parent
 * emits a `<spec-split>` with ≥2 children in R-002 order, appends additively,
 * and mints nothing (FR-001, FR-003, NFR-002).
 */

const parentHtml = `<!doctype html><html><body><main>
<spec-requirement id="FR-001" priority="must"><p>a</p></spec-requirement>
<spec-requirement id="FR-002" priority="must"><p>b</p></spec-requirement>
<spec-requirement id="FR-003" priority="must"><p>c</p></spec-requirement>
</main></body></html>`;

const decomposition = {
  children: [
    {
      specId: '030-a',
      title: 'Foundation A',
      scope: 'covers FR-001',
      assignedRequirementIds: ['FR-001'],
      dependsOn: [],
      rice: { reach: 5, impact: 5, confidence: 1, effort: 1 },
    },
    {
      specId: '031-b',
      title: 'Builds on A',
      scope: 'covers FR-002, FR-003',
      assignedRequirementIds: ['FR-002', 'FR-003'],
      dependsOn: ['030-a'],
      rice: { reach: 2, impact: 2, confidence: 1, effort: 1 },
    },
  ],
};

describe('sliceCommand', () => {
  it('emits a <spec-split> with children in R-002 order and a split verdict', async () => {
    const ai = sliceStub({
      decompositions: [decomposition],
      confirmations: [{ RICE: 'Accept' }],
    });
    const res = await sliceCommand(
      { parentSpecId: '029-value-ranked-slicer', parentHtml, runCritic: false },
      { cwd: '.', ai },
    );
    expect(res.verdict.kind).toBe('split');
    expect(res.model.orderedChildren.map((c) => c.specId)).toEqual(['030-a', '031-b']);
    expect(res.splitSection).toContain('<spec-split data-verdict="split"');
    expect(res.splitSection).toContain('data-child="030-a"');
    expect(res.model.coverage.isTotalAndDisjoint).toBe(true);
  });

  it('confirms RICE before ranking — children marked confirmed (FR-004)', async () => {
    const ai = sliceStub({
      decompositions: [decomposition],
      confirmations: [{ RICE: 'Accept' }],
    });
    const res = await sliceCommand({ parentSpecId: '029', parentHtml, runCritic: false }, { cwd: '.', ai });
    expect(res.model.orderedChildren.every((c) => c.riceConfirmed)).toBe(true);
  });

  it('appends additively — parent requirements untouched, section before </main> (NFR-002)', async () => {
    const ai = sliceStub({
      decompositions: [decomposition],
      confirmations: [{ RICE: 'Accept' }],
    });
    const res = await sliceCommand({ parentSpecId: '029', parentHtml, runCritic: false }, { cwd: '.', ai });
    const merged = appendSplitToParent(parentHtml, res.splitSection);
    expect(merged).toContain('id="FR-001"');
    expect(merged).toContain('id="FR-003"');
    expect(merged.indexOf('<spec-split')).toBeLessThan(merged.indexOf('</main>'));
  });
});

describe('splitProposalIntent (T-900, FR-008 propose route)', () => {
  it('summarises the split as a one-line change intent for /spectastic.propose', async () => {
    const ai = sliceStub({
      decompositions: [decomposition],
      confirmations: [{ RICE: 'Accept' }],
    });
    const res = await sliceCommand({ parentSpecId: '029-x', parentHtml, runCritic: false }, { cwd: '.', ai });
    const intent = splitProposalIntent(res.model);
    expect(intent).toContain('Split 029-x into 2 slices');
    expect(intent).toContain('030-a');
    expect(intent).toContain('031-b');
  });
});
