import { describe, expect, it } from 'vitest';
import { evaluateEnforcement } from '../src/commands/enforce.js';
import type { EnforcementCategory } from '../src/commands/init/profiles.js';

/** Unit tests for the pure enforcement policy diff (spec 042 T-101, SC-003). */

const req: EnforcementCategory[] = ['formatter', 'linter', 'test-runner'];

describe('evaluateEnforcement: severity → exit code', () => {
  it('hard gate with a gap → exit 1', () => {
    const r = evaluateEnforcement(req, new Set(['formatter']), 'hard');
    expect(r.missing).toEqual(['linter', 'test-runner']);
    expect(r.exitCode).toBe(1);
  });

  it('soft gate with a gap → exit 0 (warn)', () => {
    const r = evaluateEnforcement(req, new Set(['formatter']), 'soft');
    expect(r.missing.length).toBe(2);
    expect(r.exitCode).toBe(0);
  });

  it('none gate → exit 0 regardless', () => {
    expect(evaluateEnforcement(req, new Set(), 'none').exitCode).toBe(0);
  });

  it('hard gate fully covered → exit 0', () => {
    const r = evaluateEnforcement(req, new Set(req), 'hard');
    expect(r.missing).toEqual([]);
    expect(r.exitCode).toBe(0);
  });
});
