import { describe, expect, it } from 'vitest';
import { CONFORMANCE_ELEMENTS, isConformanceElement } from '../src/conformance.js';

/**
 * The conformance-bearing predicate (108-success-criteria, T-010, D-005).
 */

describe('isConformanceElement', () => {
  it('recognises both conformance-bearing elements', () => {
    expect(isConformanceElement('spec-requirement')).toBe(true);
    expect(isConformanceElement('spec-criterion')).toBe(true);
  });

  it('rejects an unrelated element', () => {
    expect(isConformanceElement('spec-decision')).toBe(false);
    expect(isConformanceElement('p')).toBe(false);
  });

  it('the exported list is exactly these two, in a stable order the parity test can rely on', () => {
    expect(CONFORMANCE_ELEMENTS).toEqual(['spec-requirement', 'spec-criterion']);
  });
});
