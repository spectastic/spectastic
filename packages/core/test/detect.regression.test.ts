import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectContract, detectTooling, exposesInterface } from '../src/enforce/detect.js';

/**
 * The regression net for spec 073-interface-detection-widening (T-010).
 *
 * NFR-002 permits at most 0 currently-covered projects to become gaps. That
 * must be PROVEN before any widening lands, not argued after — so this file is
 * written GREEN (unlike every other test in this slice, which is written red
 * first). Its job is to hold, not to fail: each case pins the verdict the
 * detector produces TODAY, so a later widening that moves one is unmistakable.
 *
 * Fixtures are temp directories built inline, matching the house pattern in
 * enforce.contract-first.test.ts / enforce.detect.test.ts rather than
 * checked-in fixture trees — the detector reads a real filesystem, so a real
 * (disposable) one is the honest input.
 */

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-detect-regression-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
  return dir;
}

const EXPRESS = '{"dependencies":{"express":"^4.19.0"}}';

/**
 * Every shape whose verdict must not move. Each entry states the verdict
 * explicitly rather than deriving it, so a widening that changes one produces
 * a diff a reviewer reads as a decision, not a silent drift.
 */
const PINNED: ReadonlyArray<{
  name: string;
  files: Record<string, string>;
  exposesInterface: boolean;
  hasContract: boolean;
  contractFirstCovered: boolean;
}> = [
  // --- interface-less projects: exempt, and must stay exempt -----------------
  {
    name: 'a library with no interface framework',
    files: { 'package.json': '{"dependencies":{"lodash":"^4"}}' },
    exposesInterface: false,
    hasContract: false,
    contractFirstCovered: true,
  },
  {
    name: 'a Go CLI with no framework',
    files: { 'go.mod': 'module x\n\ngo 1.22\n' },
    exposesInterface: false,
    hasContract: false,
    contractFirstCovered: true,
  },
  {
    name: 'an unlisted bespoke HTTP lib (the recorded false-negative ceiling)',
    files: { 'package.json': '{"dependencies":{"my-bespoke-http-lib":"^1"}}' },
    exposesInterface: false,
    hasContract: false,
    contractFirstCovered: true,
  },

  // --- HTTP/RPC/GraphQL interfaces: gap without a contract, covered with -----
  {
    name: 'express with no contract',
    files: { 'package.json': EXPRESS },
    exposesInterface: true,
    hasContract: false,
    contractFirstCovered: false,
  },
  {
    name: 'express + a root openapi.yaml',
    files: { 'package.json': EXPRESS, 'openapi.yaml': 'openapi: 3.0.0\n' },
    exposesInterface: true,
    hasContract: true,
    contractFirstCovered: true,
  },
  {
    name: 'express + api/openapi.json (a conventional subdir)',
    files: { 'package.json': EXPRESS, 'api/openapi.json': '{"openapi":"3.0.0"}' },
    exposesInterface: true,
    hasContract: true,
    contractFirstCovered: true,
  },
  {
    name: 'express + proto/service.proto',
    files: { 'package.json': EXPRESS, 'proto/service.proto': 'syntax = "proto3";\n' },
    exposesInterface: true,
    hasContract: true,
    contractFirstCovered: true,
  },
  {
    name: 'express + a root GraphQL SDL',
    files: { 'package.json': EXPRESS, 'schema.graphql': 'type Query { ok: Boolean }\n' },
    exposesInterface: true,
    hasContract: true,
    contractFirstCovered: true,
  },
  {
    name: 'express + a root asyncapi.yaml (already accepted today)',
    files: { 'package.json': EXPRESS, 'asyncapi.yaml': 'asyncapi: 3.0.0\n' },
    exposesInterface: true,
    hasContract: true,
    contractFirstCovered: true,
  },

  // --- the JSON-Schema-only-under-contracts/ rule (adversarial R-1) ----------
  {
    name: 'express + a bare root config.schema.json (NOT a contract)',
    files: { 'package.json': EXPRESS, 'config.schema.json': '{"type":"object"}' },
    exposesInterface: true,
    hasContract: false,
    contractFirstCovered: false,
  },
  {
    name: 'express + *.schema.json under schema/ (NOT a contract)',
    files: { 'package.json': EXPRESS, 'schema/data.schema.json': '{"type":"object"}' },
    exposesInterface: true,
    hasContract: false,
    contractFirstCovered: false,
  },
  {
    name: 'express + *.schema.json under contracts/ (IS a contract)',
    files: { 'package.json': EXPRESS, 'contracts/user.schema.json': '{"type":"object"}' },
    exposesInterface: true,
    hasContract: true,
    contractFirstCovered: true,
  },

  // --- per-ecosystem interface detection ------------------------------------
  {
    name: 'python fastapi, no contract',
    files: { 'pyproject.toml': '[project]\ndependencies = ["fastapi"]\n' },
    exposesInterface: true,
    hasContract: false,
    contractFirstCovered: false,
  },
  {
    name: 'java spring-web, no contract',
    files: { 'pom.xml': '<dependency>spring-boot-starter-web</dependency>' },
    exposesInterface: true,
    hasContract: false,
    contractFirstCovered: false,
  },
  {
    name: 'go gin, no contract',
    files: { 'go.mod': 'require github.com/gin-gonic/gin v1.9.1\n' },
    exposesInterface: true,
    hasContract: false,
    contractFirstCovered: false,
  },
  {
    name: 'rust axum, no contract',
    files: { 'Cargo.toml': '[dependencies]\naxum = "0.7"\n' },
    exposesInterface: true,
    hasContract: false,
    contractFirstCovered: false,
  },
];

describe('detection regression net (073, T-010) — NFR-002: at most 0 verdict changes', () => {
  it.each(PINNED.map((p) => [p.name, p] as const))('%s', (_name, pinned) => {
    const dir = fixture(pinned.files);
    expect(exposesInterface(dir), 'exposesInterface').toBe(pinned.exposesInterface);
    expect(detectContract(dir), 'detectContract').toBe(pinned.hasContract);
    expect(detectTooling(dir).has('contract-first'), 'contract-first covered').toBe(pinned.contractFirstCovered);
  });

  it('pins a meaningful number of shapes, so the net cannot silently shrink', () => {
    expect(PINNED.length).toBeGreaterThanOrEqual(16);
  });
});
