import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTRACT_SEARCH_PATHS, detectContract, detectTooling } from '../src/enforce/detect.js';

/**
 * Contract discovery at ecosystem-conventional locations (spec
 * 073-interface-detection-widening, US2 / FR-002). Written before the widening
 * exists (T-200/T-201) — failing until T-210 lands.
 *
 * The gap this closes: discovery reached the root plus exactly four directories,
 * one level deep, so a Gradle project keeping its protos where the protobuf
 * plugin puts them (src/main/proto/) was failed for lacking a contract it has.
 *
 * FR-002 forbids closing it with unbounded recursion — a recursive walk finds a
 * vendored spec in node_modules and costs unbounded time on a monorepo — so the
 * widening is by NAMED convention with a bounded depth, and T-201 asserts that
 * bound holds rather than trusting it.
 */

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-detect-paths-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
  return dir;
}

const EXPRESS = '{"dependencies":{"express":"^4.19.0"}}';
const PROTO = 'syntax = "proto3";\n';

/** Each newly-recognised conventional layout (FR-002 / SC-002). */
const CONVENTIONAL_LAYOUTS: ReadonlyArray<readonly [string, string]> = [
  ['gradle/maven protobuf plugin', 'src/main/proto/settlements.proto'],
  ['gradle/maven nested module tree', 'src/main/proto/settlements/v1/settlements.proto'],
  ['buf nested module tree', 'proto/settlements/v1/settlements.proto'],
  ['go api/proto tree', 'api/proto/v1/settlements.proto'],
  ['openapi/ directory', 'openapi/openapi.yaml'],
  ['protos/ directory', 'protos/settlements.proto'],
  ['graphql/ directory', 'graphql/schema.graphql'],
];

describe('contract discovery finds ecosystem-conventional layouts (073, FR-002)', () => {
  it.each(CONVENTIONAL_LAYOUTS.map(([name, path]) => [name, path] as const))(
    'finds a contract at %s',
    (_name, contractPath) => {
      const dir = fixture({ 'package.json': EXPRESS, [contractPath]: PROTO });
      expect(detectContract(dir)).toBe(true);
      expect(detectTooling(dir).has('contract-first')).toBe(true);
    },
  );

  it('a Gradle project with contracts ONLY under src/main/proto is covered (US2 acceptance)', () => {
    const dir = fixture({
      'build.gradle': "implementation 'org.springframework.boot:spring-boot-starter-web'",
      'src/main/proto/settlements.proto': PROTO,
    });
    expect(detectTooling(dir).has('contract-first')).toBe(true);
  });
});

describe('the widened search stays bounded — never a recursive walk (073, FR-002 / D-002)', () => {
  it('does NOT find a contract at an arbitrary unnamed path', () => {
    const dir = fixture({ 'package.json': EXPRESS, 'some/random/nested/place/service.proto': PROTO });
    expect(detectContract(dir)).toBe(false);
  });

  it('does NOT find a vendored contract inside node_modules — the recursive-walk trap', () => {
    const dir = fixture({ 'package.json': EXPRESS, 'node_modules/upstream-api/openapi.yaml': 'openapi: 3.0.0\n' });
    expect(detectContract(dir)).toBe(false);
  });

  it('does NOT descend past the bounded depth even under a named root', () => {
    // proto/ is a named convention, but an unbounded walk would keep going.
    const dir = fixture({ 'package.json': EXPRESS, 'proto/a/b/c/d/e/deep.proto': PROTO });
    expect(detectContract(dir)).toBe(false);
  });

  it('T-201: the searched path set is a finite list of explicit named segments', () => {
    // Structural half of the bound. Behaviour alone can't prove "never
    // recursive" — only that these particular trees weren't walked — so the
    // list itself is asserted finite and literal: no globs, no wildcards, and
    // every segment a plain directory name.
    expect(Array.isArray(CONTRACT_SEARCH_PATHS)).toBe(true);
    expect(CONTRACT_SEARCH_PATHS.length).toBeGreaterThan(0);
    expect(CONTRACT_SEARCH_PATHS.length).toBeLessThan(40); // finite, reviewable — not a generated tree

    for (const p of CONTRACT_SEARCH_PATHS) {
      expect(p, `"${p}" must not contain a glob or wildcard`).not.toMatch(/[*?[\]{}]/);
      expect(p, `"${p}" must not escape upward`).not.toMatch(/(^|\/)\.\.(\/|$)/);
      expect(p, `"${p}" must be relative`).not.toMatch(/^\//);
      // Bounded depth: the deepest convention this recognises is 4 segments
      // (e.g. src/main/proto/<module>) — anything more is a walk in disguise.
      expect(p.split('/').length, `"${p}" exceeds the bounded depth`).toBeLessThanOrEqual(4);
    }
  });

  it('T-201: never reads a well-known heavy directory, even when it holds a contract-shaped file', () => {
    const dir = fixture({
      'package.json': EXPRESS,
      'node_modules/upstream-api/openapi.yaml': 'openapi: 3.0.0\n',
      'vendor/y/thing.proto': PROTO,
      'target/debug/generated.proto': PROTO,
      'build/generated/schema.graphql': 'type Query { ok: Boolean }\n',
    });
    // If any of these were reachable, the project would read as covered.
    expect(detectContract(dir)).toBe(false);
  });
});
