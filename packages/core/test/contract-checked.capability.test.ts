import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectContractChecks } from '../src/enforce/detect.js';
import { CONTRACT_CHECK_CAPABILITY_LIMITS, evaluateContractChecks } from '../src/enforce/policy.js';

/**
 * Per-format capability limits (spec 074-contract-checked-tier, US3 / FR-003).
 * Written before the evaluation exists (T-300) — failing until T-310/T-311.
 *
 * Honest asymmetry: where a format's ecosystem has no mainstream tool for one
 * half of the check, that half reports ADVISORY with the limitation stated —
 * never a hard fail (failing a project for tooling that does not exist is the
 * warn-washing the enforcement design avoids) and never a silent pass (which
 * would overstate what the rung means).
 */

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-contract-capability-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
  return dir;
}

describe('T-300/SC-002: a capability-limited half reports advisory, never a hard fail', () => {
  it('an AsyncAPI contract with a linter configured is NOT hard-failed for its missing differ', () => {
    const dir = fixture({
      'asyncapi.yaml': 'asyncapi: 3.0.0\n',
      '.spectral.yaml': 'extends: spectral:asyncapi\n',
    });
    const verdict = evaluateContractChecks(detectContractChecks(dir));

    expect(verdict.blocking).toEqual([]); // the differ half cannot block
    expect(verdict.advisory).toHaveLength(1);
    expect(verdict.advisory[0]?.format).toBe('asyncapi');
    expect(verdict.advisory[0]?.half).toBe('differ');
  });

  it('the advisory states the limitation rather than silently downgrading (FR-003)', () => {
    const dir = fixture({
      'asyncapi.yaml': 'asyncapi: 3.0.0\n',
      '.spectral.yaml': 'extends: spectral:asyncapi\n',
    });
    const verdict = evaluateContractChecks(detectContractChecks(dir));

    expect(verdict.advisory[0]?.limitation).toBeTruthy();
    expect(verdict.advisory[0]?.limitation).toMatch(/no mainstream|tooling/i);
  });

  it.each(Object.keys(CONTRACT_CHECK_CAPABILITY_LIMITS))(
    '%s: every capability-limited half is advisory across 100%% of marked formats (SC-002)',
    (format) => {
      const limitedHalves = CONTRACT_CHECK_CAPABILITY_LIMITS[format] ?? [];
      for (const half of limitedHalves) {
        const verdict = evaluateContractChecks([
          { path: `x.${format}`, format, linted: half !== 'linter', diffed: half !== 'differ' },
        ]);
        expect(verdict.blocking, `${format}/${half} must not block`).toEqual([]);
        expect(verdict.advisory.map((a) => a.half)).toContain(half);
      }
    },
  );

  it('a NON-capability-limited missing half still blocks — the carve-out is not a blanket exemption', () => {
    // OpenAPI has mainstream tooling for both halves, so a missing differ is a
    // real gap, not an advisory.
    const verdict = evaluateContractChecks([{ path: 'openapi.yaml', format: 'openapi', linted: true, diffed: false }]);

    expect(verdict.advisory).toEqual([]);
    expect(verdict.blocking).toHaveLength(1);
    expect(verdict.blocking[0]?.half).toBe('differ');
  });

  it('a capability-limited format still blocks on its NON-limited half', () => {
    // AsyncAPI's differ is limited; its linter is not. A missing linter is a real gap.
    const verdict = evaluateContractChecks([
      { path: 'asyncapi.yaml', format: 'asyncapi', linted: false, diffed: false },
    ]);

    expect(verdict.blocking.map((b) => b.half)).toEqual(['linter']);
    expect(verdict.advisory.map((a) => a.half)).toEqual(['differ']);
  });

  it('a fully-configured contract reports neither blocking nor advisory', () => {
    const verdict = evaluateContractChecks([{ path: 'openapi.yaml', format: 'openapi', linted: true, diffed: true }]);
    expect(verdict.blocking).toEqual([]);
    expect(verdict.advisory).toEqual([]);
  });

  it('a project holding no contract has nothing to report (the vacuous case)', () => {
    expect(evaluateContractChecks([])).toEqual({ blocking: [], advisory: [] });
  });
});

describe('T-101/FR-004: the verdict names which contract and which half', () => {
  it('reports path, format and half for each shortfall', () => {
    const verdict = evaluateContractChecks([
      { path: 'api/openapi.yaml', format: 'openapi', linted: false, diffed: false },
    ]);
    expect(verdict.blocking).toHaveLength(2); // both halves, separately named
    expect(verdict.blocking.map((b) => b.half).sort()).toEqual(['differ', 'linter']);
    for (const b of verdict.blocking) {
      expect(b.path).toBe('api/openapi.yaml');
      expect(b.format).toBe('openapi');
    }
  });
});

describe('T-201/D-005: a first contract satisfies the differ half when a differ is configured', () => {
  it('no predecessor is not a reason to withhold the differ half', () => {
    // The differ is configured; whether it has ever had a baseline to compare
    // against is not something detection can or should judge. No
    // configured-but-not-yet-exercised state exists.
    const dir = fixture({
      'openapi.yaml': 'openapi: 3.0.0\n',
      '.spectral.yaml': 'extends: spectral:oas\n',
      '.github/workflows/ci.yml': 'steps:\n  - run: oasdiff breaking base.yaml openapi.yaml\n',
    });
    const verdict = evaluateContractChecks(detectContractChecks(dir));

    expect(verdict.blocking).toEqual([]);
    expect(verdict.advisory).toEqual([]);
  });
});
