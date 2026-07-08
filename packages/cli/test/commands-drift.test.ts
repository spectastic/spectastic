import { describe, expect, it } from 'vitest';
import { commandsDriftFinding } from '@spectastic/core/commands/validate';

/**
 * T-201 of specs/031-init-tools/tasks.html. The commands-drift finding (US2 /
 * D-001, FR-007): a managed adapter that matches source is clean; a divergent
 * or missing adapter is an error, so the pre-commit gate blocks a stale commit.
 */
const FILE = '.claude/commands/spectastic.spec.md';

describe('commandsDriftFinding', () => {
  it('is clean when the adapter matches source byte-for-byte', () => {
    expect(commandsDriftFinding('SOURCE\n', 'SOURCE\n', FILE)).toBeNull();
  });

  it('errors when the adapter has drifted from source', () => {
    const f = commandsDriftFinding('SOURCE\n', 'STALE\n', FILE);
    expect(f?.rule).toBe('commands-drift');
    expect(f?.severity).toBe('error');
    expect(f?.message).toContain('drifted');
  });

  it('errors when the adapter is missing', () => {
    const f = commandsDriftFinding('SOURCE\n', null, FILE);
    expect(f?.severity).toBe('error');
    expect(f?.message).toContain('missing');
  });
});
