import { describe, expect, it } from 'vitest';
import { specCommand } from '../commands/spec.js';
import { sliceStub } from './stub-ai.js';

/**
 * US1 (T-115): the `spec` verb's split-mode appends a `<spec-split>` proposal to
 * the parent and leaves its requirements untouched (FR-001, FR-008 Draft path).
 */

const parent = `<!doctype html><html><body><main>
<spec-status value="draft">Draft</spec-status>
<spec-requirement id="FR-001" priority="must"><p>a</p></spec-requirement>
<spec-requirement id="FR-002" priority="must"><p>b</p></spec-requirement>
</main></body></html>`;

const decomposition = {
  children: [
    {
      specId: '030-a',
      title: 'A',
      scope: 'FR-001',
      assignedRequirementIds: ['FR-001'],
      dependsOn: [],
      rice: { reach: 5, impact: 5, confidence: 1, effort: 1 },
    },
    {
      specId: '031-b',
      title: 'B',
      scope: 'FR-002',
      assignedRequirementIds: ['FR-002'],
      dependsOn: ['030-a'],
      rice: { reach: 2, impact: 2, confidence: 1, effort: 1 },
    },
  ],
};

describe('specCommand split-mode', () => {
  it('appends a <spec-split> proposal, leaving parent requirements intact', async () => {
    // split-mode runs the coverage critic by default (FR-006), so script a subagent.
    const ai = sliceStub({
      decompositions: [decomposition],
      confirmations: [{ RICE: 'Accept' }],
      agents: ['{"ok":true,"notes":[]}'],
    });
    const res = await specCommand(
      {
        description: '029-value-ranked-slicer',
        specId: '029-value-ranked-slicer',
        existingSpec: parent,
        split: true,
      },
      { cwd: '.', ai },
    );
    expect(res.html).toContain('<spec-split data-verdict="split"');
    expect(res.html).toContain('id="FR-001"');
    expect(res.html).toContain('id="FR-002"');
    expect(res.requirementsCount).toBe(2);
  });

  it('throws when split mode lacks the parent spec', async () => {
    const ai = sliceStub({});
    await expect(specCommand({ description: 'x', split: true }, { cwd: '.', ai })).rejects.toThrow();
  });
});
