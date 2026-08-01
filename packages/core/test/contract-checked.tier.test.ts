import { describe, expect, it } from 'vitest';
import { contractCheckedApplies } from '../src/enforce/policy.js';

/**
 * The tier gate for the contract-checked rung (spec 074-contract-checked-tier,
 * Foundational / NFR-002). Built BEFORE any signal so a below-verified project
 * short-circuits before anything is read — the structural way to satisfy
 * NFR-002 ("at most 0 lean- or standard-profile projects may gain a gap")
 * rather than testing for it afterwards.
 *
 * T-010 is the regression half and is written GREEN: it pins that lean and
 * standard are untouched. T-011 is the gate half and is written red.
 */

describe('T-011: the contract-checked condition is tier-gated (074, FR-001)', () => {
  it('applies at verified', () => {
    expect(contractCheckedApplies('verified')).toBe(true);
  });

  it('applies at enterprise', () => {
    expect(contractCheckedApplies('enterprise')).toBe(true);
  });

  it('does NOT apply at standard — where the axis says contract-first, not contract-checked', () => {
    expect(contractCheckedApplies('standard')).toBe(false);
  });

  it('does NOT apply at lean', () => {
    expect(contractCheckedApplies('lean')).toBe(false);
  });

  it('does NOT apply with no profile at all — fails safe', () => {
    expect(contractCheckedApplies(undefined)).toBe(false);
  });

  it('does NOT apply for an unknown profile name — fails safe rather than guessing', () => {
    expect(contractCheckedApplies('some-future-tier')).toBe(false);
  });
});

describe('T-010: below-verified verdicts are pinned unchanged (074, NFR-002 / SC-003)', () => {
  // The regression half. These assert the GATE, not the detector: if the gate
  // ever admits a below-verified tier, every one of these flips, and the rung
  // could not have changed a lean/standard verdict without one failing first.
  it.each(['lean', 'standard'])('%s never evaluates the contract-checked condition', (tier) => {
    expect(contractCheckedApplies(tier)).toBe(false);
  });

  it('the gated tier set is exactly verified and enterprise — no silent third member', () => {
    const tiers = ['lean', 'standard', 'verified', 'enterprise'];
    const gated = tiers.filter((t) => contractCheckedApplies(t));
    expect(gated).toEqual(['verified', 'enterprise']);
  });
});
