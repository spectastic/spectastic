import { describe, expect, it } from 'vitest';
import { quarantineFinding } from '../src/commands/explore.js';

/**
 * T-200 (spec 022-explore, FR-005 / NFR-001 / SC-002). The validate leg of the
 * anti-ship guard: a quarantined marker yields an error-level finding, always —
 * there is no opt-in flag, so the gate is deterministic and cannot be sidestepped.
 */

const FILE = 'explorations/023-x/quarantine.json';

describe('quarantineFinding', () => {
  it('emits an error finding for a quarantined marker', () => {
    const finding = quarantineFinding(
      {
        id: '023-x',
        intent: 'try it',
        status: 'quarantined',
        created: '2026-06-24',
      },
      FILE,
    );
    expect(finding).not.toBeNull();
    expect(finding?.severity).toBe('error');
    expect(finding?.rule).toBe('explore-quarantined');
    expect(finding?.file).toBe(FILE);
    expect(finding?.message).toContain('023-x');
    expect(finding?.fixHint).toContain('Graduate');
  });

  it('is deterministic — same marker, same finding, no flag input', () => {
    const marker = { id: '023-x', status: 'quarantined' as const };
    expect(quarantineFinding(marker, FILE)).toEqual(quarantineFinding(marker, FILE));
  });

  it('returns null when the marker is not quarantined (graduated/removed)', () => {
    expect(quarantineFinding({ id: '023-x', status: 'graduated' }, FILE)).toBeNull();
    expect(quarantineFinding({ id: '023-x' }, FILE)).toBeNull();
  });

  it('still flags a corrupt marker that asserts quarantined status', () => {
    // The CLI passes { status: 'quarantined' } for an unreadable-but-present marker.
    const finding = quarantineFinding({ status: 'quarantined' }, FILE);
    expect(finding?.severity).toBe('error');
    expect(finding?.message).toContain('(unknown id)');
  });
});
