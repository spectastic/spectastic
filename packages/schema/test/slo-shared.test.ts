import { describe, expect, it } from 'vitest';
import { GOLDEN_SIGNALS, isGoldenSignal, isQuantifiedTarget } from '../src/slo-shared.js';

/**
 * 047-slo-nfr-artifact T-002: red-first tests for the quantified-NFR
 * heuristic. The bug: `NUMBER_UNIT_RE` ended with `\b` after an alternation
 * whose members include `%`. A word boundary can only hold between a word and
 * a non-word character, and `%` is non-word — so after matching `%` the
 * assertion required a *word* character next, which ordinary prose never
 * supplies (a space, a full stop, or end of input). The `%` alternative was
 * therefore unreachable, and a bare percentage never counted as quantified.
 *
 * It survived because every existing test phrased its percentage with a
 * comparison (`99% < 200ms`) or a threshold word (`at least 99%`), each of
 * which is rescued by a different branch. Only a standalone percentage fails.
 *
 * Direction matters here: the heuristic's own contract is that false
 * negatives are worse than false positives, because it gates a hard error at
 * verified/enterprise. A dead `%` branch is precisely that false negative, on
 * the most common unit an NFR uses.
 */

describe('isQuantifiedTarget: a bare percentage (T-002)', () => {
  it('accepts a percentage followed by a space', () => {
    expect(isQuantifiedTarget('99% uptime')).toBe(true);
    expect(isQuantifiedTarget('100% of requests are logged')).toBe(true);
  });

  it('accepts a percentage at end of input', () => {
    expect(isQuantifiedTarget('availability of 100%')).toBe(true);
  });

  it('accepts a percentage followed by punctuation', () => {
    expect(isQuantifiedTarget('Coverage stays at 90%.')).toBe(true);
    expect(isQuantifiedTarget('Two targets: 90%, then 95%')).toBe(true);
  });

  it('accepts a decimal percentage', () => {
    expect(isQuantifiedTarget('error budget 0.1%')).toBe(true);
  });

  it('accepts a percentage with a space before the sign', () => {
    expect(isQuantifiedTarget('at 99.9 % availability')).toBe(true);
  });
});

describe('isQuantifiedTarget: branches that already worked stay working', () => {
  it('accepts a percentile marker', () => {
    expect(isQuantifiedTarget('p95 latency is the target')).toBe(true);
    expect(isQuantifiedTarget('P99 under load')).toBe(true);
  });

  it('accepts a comparison against a number', () => {
    expect(isQuantifiedTarget('p95 < 200 ms')).toBe(true);
    expect(isQuantifiedTarget('availability >= 99%')).toBe(true);
    expect(isQuantifiedTarget('latency ≤ 1s')).toBe(true);
  });

  it('accepts a number with a word unit', () => {
    expect(isQuantifiedTarget('completes in 200ms')).toBe(true);
    expect(isQuantifiedTarget('within 30 seconds')).toBe(true);
    expect(isQuantifiedTarget('sustains 500 rps')).toBe(true);
  });

  it('accepts a threshold word near a number', () => {
    expect(isQuantifiedTarget('at least 99 nines of something')).toBe(true);
    expect(isQuantifiedTarget('at most 0 network calls')).toBe(true);
  });
});

describe('isQuantifiedTarget: still rejects genuinely unquantified prose', () => {
  it('rejects prose with no number at all', () => {
    expect(isQuantifiedTarget('The system must be fast.')).toBe(false);
    expect(isQuantifiedTarget('Renders quickly and feels responsive.')).toBe(false);
  });

  it('rejects empty and whitespace-only input', () => {
    expect(isQuantifiedTarget('')).toBe(false);
    expect(isQuantifiedTarget('   ')).toBe(false);
  });

  it('rejects a bare number with no unit, comparison, or threshold word', () => {
    expect(isQuantifiedTarget('Supports version 3 of the protocol.')).toBe(false);
  });

  it('does not treat a percent sign with no number as quantified', () => {
    expect(isQuantifiedTarget('a % sign on its own')).toBe(false);
  });
});

describe('isGoldenSignal', () => {
  it('accepts each of the Four Golden Signals', () => {
    for (const signal of GOLDEN_SIGNALS) expect(isGoldenSignal(signal)).toBe(true);
  });

  it('rejects a term outside the taxonomy', () => {
    expect(isGoldenSignal('availability')).toBe(false);
    expect(isGoldenSignal('')).toBe(false);
  });
});
