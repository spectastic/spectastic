import { describe, expect, it } from 'vitest';
import { canAppendInPlace, shouldAutoOffer } from './gate.js';

/**
 * US4 (T-400): the split gate predicates. In-place append is Draft-only (FR-008);
 * the auto-offer fires only on the red band (FR-010) and never runs on its own.
 */

describe('canAppendInPlace (FR-008 / P-6)', () => {
  it('allows a Draft parent', () => {
    expect(canAppendInPlace('draft')).toBe(true);
  });
  it('refuses terminal states', () => {
    expect(canAppendInPlace('accepted')).toBe(false);
    expect(canAppendInPlace('superseded')).toBe(false);
    expect(canAppendInPlace(null)).toBe(false);
  });
});

describe('shouldAutoOffer (FR-010)', () => {
  it('offers only on the red band', () => {
    expect(shouldAutoOffer('red')).toBe(true);
    expect(shouldAutoOffer('amber')).toBe(false);
    expect(shouldAutoOffer('green')).toBe(false);
    expect(shouldAutoOffer(null)).toBe(false);
  });
});
