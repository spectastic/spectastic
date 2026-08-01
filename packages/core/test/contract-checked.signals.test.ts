import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectContractChecks } from '../src/enforce/detect.js';

/**
 * Configured-check detection for the contract-checked rung (spec
 * 074-contract-checked-tier, US1/US2). Written before the signals exist
 * (T-100/T-101/T-200/T-202) — failing until T-110/T-111/T-210 land.
 *
 * The load-bearing rule (FR-002 / D-002): a signal is a DECLARED
 * CONFIGURATION — a ruleset file, a CI invocation — never the mere presence of
 * a tool as a dependency. Coverage draws the same distinction for the same
 * reason: an installed tool that never runs certifies nothing.
 */

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-contract-checked-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
  return dir;
}

const OPENAPI = { 'openapi.yaml': 'openapi: 3.0.0\n' };

describe('T-100/SC-001: a contract with no configured checks is short on both halves', () => {
  it('reports the contract with neither half configured', () => {
    const checks = detectContractChecks(fixture(OPENAPI));
    expect(checks).toHaveLength(1);
    expect(checks[0]?.format).toBe('openapi');
    expect(checks[0]?.linted).toBe(false);
    expect(checks[0]?.diffed).toBe(false);
  });

  it('configuring a linter reduces it to one missing half', () => {
    const checks = detectContractChecks(fixture({ ...OPENAPI, '.spectral.yaml': 'extends: spectral:oas\n' }));
    expect(checks[0]?.linted).toBe(true);
    expect(checks[0]?.diffed).toBe(false);
  });

  it('configuring a differ too reduces it to zero missing halves', () => {
    const checks = detectContractChecks(
      fixture({
        ...OPENAPI,
        '.spectral.yaml': 'extends: spectral:oas\n',
        '.github/workflows/ci.yml': 'jobs:\n  api:\n    steps:\n      - run: oasdiff breaking base.yaml openapi.yaml\n',
      }),
    );
    expect(checks[0]?.linted).toBe(true);
    expect(checks[0]?.diffed).toBe(true);
  });

  it('a project holding no contract at all reports nothing to check', () => {
    expect(detectContractChecks(fixture({ 'package.json': '{}' }))).toEqual([]);
  });
});

describe('T-200/FR-002: a declared configuration counts; a bare dependency does not', () => {
  it('a linter listed only as a dependency does NOT satisfy the linter half', () => {
    const checks = detectContractChecks(
      fixture({ ...OPENAPI, 'package.json': '{"devDependencies":{"@stoplight/spectral-cli":"^6"}}' }),
    );
    expect(checks[0]?.linted).toBe(false);
  });

  it('a declared Spectral ruleset DOES satisfy it', () => {
    const checks = detectContractChecks(fixture({ ...OPENAPI, '.spectral.yaml': 'extends: spectral:oas\n' }));
    expect(checks[0]?.linted).toBe(true);
  });

  it('a Spectral invocation in a CI definition also satisfies it', () => {
    const checks = detectContractChecks(
      fixture({ ...OPENAPI, '.github/workflows/ci.yml': 'steps:\n  - run: spectral lint openapi.yaml\n' }),
    );
    expect(checks[0]?.linted).toBe(true);
  });

  it('a differ listed only as a dependency does NOT satisfy the differ half', () => {
    const checks = detectContractChecks(
      fixture({ ...OPENAPI, 'package.json': '{"devDependencies":{"oasdiff":"^1"}}' }),
    );
    expect(checks[0]?.diffed).toBe(false);
  });
});

describe('T-202/FR-006: one tool may satisfy both halves, and tooling may differ per format', () => {
  it("buf's lint and breaking stanzas satisfy both halves for a proto", () => {
    const checks = detectContractChecks(
      fixture({
        'proto/service.proto': 'syntax = "proto3";\n',
        'buf.yaml': 'version: v2\nlint:\n  use:\n    - STANDARD\nbreaking:\n  use:\n    - FILE\n',
      }),
    );
    expect(checks).toHaveLength(1);
    expect(checks[0]?.format).toBe('proto');
    expect(checks[0]?.linted).toBe(true);
    expect(checks[0]?.diffed).toBe(true);
  });

  it('T-101/FR-004: a linted OpenAPI and an unlinted proto are reported separately', () => {
    const checks = detectContractChecks(
      fixture({
        ...OPENAPI,
        'proto/service.proto': 'syntax = "proto3";\n',
        '.spectral.yaml': 'extends: spectral:oas\n', // OpenAPI only — not proto
      }),
    );
    const byFormat = Object.fromEntries(checks.map((c) => [c.format, c]));
    expect(byFormat.openapi?.linted).toBe(true);
    expect(byFormat.proto?.linted).toBe(false);
    // Each carries its own path so the report can name the contract, not just the format.
    expect(byFormat.openapi?.path).toMatch(/openapi\.yaml$/);
    expect(byFormat.proto?.path).toMatch(/service\.proto$/);
  });
});

describe('T-210/NFR-001: detection reads configuration only — no tool is ever invoked', () => {
  it('completes without spawning anything, even where a real tool would fail', () => {
    // The config names a ruleset file that does not exist and a base spec that
    // does not exist. A real spectral/oasdiff run would error; detection must
    // simply read the text and report configured.
    const checks = detectContractChecks(
      fixture({
        ...OPENAPI,
        '.spectral.yaml': 'extends: ./no-such-ruleset.yaml\n',
        '.github/workflows/ci.yml': 'steps:\n  - run: oasdiff breaking does-not-exist.yaml openapi.yaml\n',
      }),
    );
    expect(checks[0]?.linted).toBe(true);
    expect(checks[0]?.diffed).toBe(true);
  });
});
