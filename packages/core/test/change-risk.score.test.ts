import { describe, expect, it } from 'vitest';
import { score } from '../src/change-risk/score.js';
import type { RedFlagFinding } from '../src/change-risk/types.js';

/**
 * Unit tests for score() — the saturating weighted sum + config-driven band
 * mapping (spec 049 FR-004/FR-005, plan D-004). high=40, medium=15, low=5,
 * capped at 100; default bands green<25, amber 25–60, red>60.
 */

function finding(weight: RedFlagFinding['weight']): RedFlagFinding {
  return { category: 'binary-blob', weight, file: 'x', evidence: 'x' };
}

describe('score', () => {
  it('weights: high=40, medium=15, low=5', () => {
    expect(score([finding('high')], {})).toEqual({ score: 40, band: 'amber' });
    expect(score([finding('medium')], {})).toEqual({
      score: 15,
      band: 'green',
    });
    expect(score([finding('low')], {})).toEqual({ score: 5, band: 'green' });
  });

  it('sums across findings, saturating at 100', () => {
    expect(score([finding('high'), finding('high'), finding('high')], {})).toEqual({
      score: 100,
      band: 'red',
    });
  });

  it('two highs land in the red band by default (80)', () => {
    expect(score([finding('high'), finding('high')], {})).toEqual({
      score: 80,
      band: 'red',
    });
  });

  it('zero findings is score 0, green', () => {
    expect(score([], {})).toEqual({ score: 0, band: 'green' });
  });

  it('respects default band boundaries (amber inclusive on both ends)', () => {
    expect(score([finding('medium'), finding('low')], {})).toEqual({
      score: 20,
      band: 'green',
    }); // 20 < 25
    expect(score([finding('high')], {})).toMatchObject({ band: 'amber' }); // 40, in [25,60]
  });

  it('uses configured bands over the shipped defaults', () => {
    const findings = [finding('medium')]; // 15 points
    expect(score(findings, {})).toMatchObject({ band: 'green' });
    expect(score(findings, { bands: { amber: 10, red: 50 } })).toMatchObject({
      band: 'amber',
    });
  });
});
