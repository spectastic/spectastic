import { describe, expect, it } from 'vitest';
import { verbModelPolicyFinding } from '../src/commands/validate.js';

const withFm = (verb: string, body: string) =>
  `---\ndescription: x\ntriggers:\n  - a\nuse-when: "x"\nsibling-boundary: "x"\n${body}---\n\n# ${verb}\n`;

describe('verb-model-policy drift-guard (spec 044 FR-009)', () => {
  it('passes a legal model: matching the policy map', () => {
    const f = verbModelPolicyFinding(withFm('implement', 'model: sonnet\n'), 'commands/spectastic.implement.md');
    expect(f).toBeNull();
  });

  it('passes an inherit verb declaring inherit', () => {
    const f = verbModelPolicyFinding(withFm('design', 'model: inherit\n'), 'commands/spectastic.design.md');
    expect(f).toBeNull();
  });

  it('is clean when the optional model: key is absent', () => {
    const f = verbModelPolicyFinding(withFm('implement', ''), 'commands/spectastic.implement.md');
    expect(f).toBeNull();
  });

  it('flags an illegal alias (the typo case)', () => {
    const f = verbModelPolicyFinding(withFm('implement', 'model: sonet\n'), 'commands/spectastic.implement.md');
    expect(f?.rule).toBe('verb-model-policy');
    expect(f?.severity).toBe('error');
    expect(f?.message).toContain('not a legal tier alias');
  });

  it('flags a pinned model id (aliases only)', () => {
    const f = verbModelPolicyFinding(withFm('apply', 'model: claude-sonnet-5\n'), 'commands/spectastic.apply.md');
    expect(f?.rule).toBe('verb-model-policy');
    expect(f?.severity).toBe('error');
  });

  it('flags drift from the policy map (legal alias, wrong verb)', () => {
    // implement is policy=sonnet; declaring opus is legal-but-drifted
    const f = verbModelPolicyFinding(withFm('implement', 'model: opus\n'), 'commands/spectastic.implement.md');
    expect(f?.rule).toBe('verb-model-policy');
    expect(f?.message).toContain('drift');
  });

  it('returns null when there is no frontmatter (skill-metadata-shape owns that)', () => {
    const f = verbModelPolicyFinding('# no frontmatter\n', 'commands/spectastic.implement.md');
    expect(f).toBeNull();
  });
});
