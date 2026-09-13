import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildGoverningDecisionsBlock } from '../src/guardrail/injection.js';
import { planConstraintFindings, type DesignDoc } from '../src/guardrail/plan-constraint.js';
import { verdictFor } from '../src/guardrail/verdict.js';
import type { GovernanceDecision } from '../src/guardrail/types.js';

/**
 * Slice 4 injection (spec 116, FR-001..FR-005, SC-001/SC-002/SC-003). Tests-first.
 */

const D = (o: Partial<GovernanceDecision> & Pick<GovernanceDecision, 'id' | 'specId'>): GovernanceDecision => ({
  paths: [],
  modules: [],
  ...o,
});

const GOVERNING = D({
  id: 'D-007',
  specId: '002-downstream',
  status: 'accepted',
  paths: ['src/**/persistence/**'],
  reason: 'Every position change must emit PositionChanged.',
  enforcement: { rules: [{ tool: 'archunit', id: 'r' }] },
});

describe('buildGoverningDecisionsBlock (SC-001)', () => {
  it('renders a governing decision fenced as data, with id and reason', () => {
    const block = buildGoverningDecisionsBlock(['src/app/persistence/Repo.java'], [GOVERNING], 'acme/pk');
    expect(block).not.toBe('');
    expect(block).toMatch(/002-downstream\/D-007/);
    expect(block).toMatch(/PositionChanged/);
    // Fenced as untrusted data (the corpus posture), not an instruction.
    expect(block).toMatch(/BEGIN GOVERNING_DECISIONS DATA|GOVERNING_DECISIONS/);
    expect(block).toMatch(/data, not instructions/i);
  });

  it('returns empty string for an unrelated surface', () => {
    expect(buildGoverningDecisionsBlock(['docs/readme.md'], [GOVERNING], 'acme/pk')).toBe('');
  });

  it('returns empty string for no paths (a design authored fresh — FR-003)', () => {
    expect(buildGoverningDecisionsBlock([], [GOVERNING], 'acme/pk')).toBe('');
  });

  it('is deterministic (SC-002)', () => {
    const a = buildGoverningDecisionsBlock(['src/app/persistence/Repo.java'], [GOVERNING], 'acme/pk');
    const b = buildGoverningDecisionsBlock(['src/app/persistence/Repo.java'], [GOVERNING], 'acme/pk');
    expect(a).toBe(b);
  });
});

describe('the advisory implement nudge is present (SC-004)', () => {
  // Presence is structurally checkable even though behaviour (T-009) is not.
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, '..', '..', '..');
  it('commands/spectastic.implement.md instructs consulting adrs --for', () => {
    const md = readFileSync(join(root, 'commands', 'spectastic.implement.md'), 'utf8');
    expect(md).toMatch(/adrs --for/);
  });
  it('the spectastic-impl-task agent instructs consulting adrs --for', () => {
    const md = readFileSync(join(root, 'agents', 'spectastic-impl-task.md'), 'utf8');
    expect(md).toMatch(/adrs --for/);
  });
});

describe('injection is an aid, not a gate (SC-003 — gate independence)', () => {
  const decisions = [GOVERNING];
  const draftDesign: DesignDoc = {
    specId: '009-recon',
    file: 'specs/009-recon/design.html',
    html: '<section id="project-structure"><pre><code>src/recon/persistence/Job.java</code></pre></section>',
  };

  it('the plan-constraint verdict is identical whether or not the block was built', () => {
    const before = planConstraintFindings([draftDesign], decisions);
    buildGoverningDecisionsBlock(['src/recon/persistence/Job.java'], decisions, 'acme/pk'); // build the aid
    const after = planConstraintFindings([draftDesign], decisions);
    expect(after).toEqual(before);
  });

  it('the merge verdict is identical whether or not the block was built', () => {
    const args = {
      changed: ['src/recon/persistence/Job.java'],
      decisions,
      now: new Date('2026-09-13T00:00:00.000Z'),
      readFile: () => null,
    };
    const before = verdictFor(args);
    buildGoverningDecisionsBlock(['src/recon/persistence/Job.java'], decisions, 'acme/pk');
    const after = verdictFor(args);
    expect(after).toEqual(before);
  });
});
