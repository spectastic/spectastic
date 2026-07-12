import { describe, expect, it } from 'vitest';
import { quantifiedNfrFindings } from '../src/commands/validate.js';

/**
 * Unit tests for the FR-004 quantified-NFR core (spec 047-slo-nfr-artifact,
 * US2). Written before the function exists (T-200) — failing until T-210
 * lands, per the plan's D-005 test-first discipline.
 *
 * Deliberately does NOT test the slo= attribute here — that capability is
 * added by T-310 (US3) and tested separately in T-300.
 */

const RULE = 'quantified-nfr-required';

function doc(html: string, file = 'specs/999-x/spec.html') {
  return [{ html: `<!doctype html><html><body><main>${html}</main></body></html>`, file }];
}

describe('quantifiedNfrFindings: tier gating', () => {
  const unquantified = doc('<spec-requirement id="NFR-001"><p>The system must be fast.</p></spec-requirement>');

  it('flags an unquantified NFR at verified', () => {
    const findings = quantifiedNfrFindings(unquantified, { tier: 'verified' });
    expect(findings.length).toBe(1);
    expect(findings[0]?.rule).toBe(RULE);
    expect(findings[0]?.severity).toBe('error');
  });

  it('flags an unquantified NFR at enterprise', () => {
    expect(quantifiedNfrFindings(unquantified, { tier: 'enterprise' }).length).toBe(1);
  });

  it('does not flag at standard', () => {
    expect(quantifiedNfrFindings(unquantified, { tier: 'standard' })).toEqual([]);
  });

  it('does not flag at lean', () => {
    expect(quantifiedNfrFindings(unquantified, { tier: 'lean' })).toEqual([]);
  });

  it('does not flag with no tier (no profile marker)', () => {
    expect(quantifiedNfrFindings(unquantified, { tier: undefined })).toEqual([]);
  });
});

describe('quantifiedNfrFindings: what counts as quantified', () => {
  it('an inline-quantified NFR (p95 target in prose) passes at verified', () => {
    const d = doc('<spec-requirement id="NFR-001"><p>p95 latency &lt; 200 ms.</p></spec-requirement>');
    expect(quantifiedNfrFindings(d, { tier: 'verified' })).toEqual([]);
  });

  it('an NFR refined by a linked <spec-slo> passes at verified, even with vague prose', () => {
    const d = doc(`
      <spec-requirement id="NFR-001"><p>The system must be fast.</p></spec-requirement>
      <spec-slo target="NFR-001" objective="99% &lt; 200ms" window="28d" budgeting="occurrences">fraction under 200ms</spec-slo>
    `);
    expect(quantifiedNfrFindings(d, { tier: 'verified' })).toEqual([]);
  });

  it('an NFR with only a compact slo= attribute passes at verified (US3, T-300)', () => {
    // No measurable number in the prose, no linked <spec-slo> element — just
    // the light annotation (FR-003). Fails until T-310 extends the function.
    const d = doc('<spec-requirement id="NFR-001" slo="99% &lt; 200ms / 28d"><p>The system must be fast.</p></spec-requirement>');
    expect(quantifiedNfrFindings(d, { tier: 'verified' })).toEqual([]);
  });

  it('an empty slo= attribute does NOT satisfy quantified (T-300)', () => {
    const d = doc('<spec-requirement id="NFR-001" slo=""><p>The system must be fast.</p></spec-requirement>');
    expect(quantifiedNfrFindings(d, { tier: 'verified' }).length).toBe(1);
  });

  it('a non-NFR requirement (FR-*) is never checked', () => {
    const d = doc('<spec-requirement id="FR-001"><p>The system must be fast.</p></spec-requirement>');
    expect(quantifiedNfrFindings(d, { tier: 'verified' })).toEqual([]);
  });

  it('multiple unquantified NFRs each produce their own finding', () => {
    const d = doc(`
      <spec-requirement id="NFR-001"><p>Fast.</p></spec-requirement>
      <spec-requirement id="NFR-002"><p>Reliable.</p></spec-requirement>
    `);
    expect(quantifiedNfrFindings(d, { tier: 'verified' }).length).toBe(2);
  });
});
