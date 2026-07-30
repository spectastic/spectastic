import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectContract, detectTooling, exposesInterface } from '../src/enforce/detect.js';

/**
 * Unit tests for the interface-gated contract-first category
 * (spec 042, 2026-07-11-contract-first-enforce, FR-002 / FR-014).
 */

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-contract-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
  return dir;
}

const EXPRESS = '{"dependencies":{"express":"^4.19.0"}}';

describe('contract-first: interface-gating (FR-014)', () => {
  it('no interface framework + no contract → covered (exempt — nothing to contract)', () => {
    const dir = fixture({ 'package.json': '{"dependencies":{"lodash":"^4"}}' });
    expect(exposesInterface(dir)).toBe(false);
    expect(detectTooling(dir).has('contract-first')).toBe(true);
  });

  it('a CLI (no framework) is never a contract gap', () => {
    const dir = fixture({ 'go.mod': 'module x\n\ngo 1.22\n' });
    expect(exposesInterface(dir)).toBe(false);
    expect(detectTooling(dir).has('contract-first')).toBe(true);
  });

  it('interface framework + NO contract → NOT covered (a real gap)', () => {
    const dir = fixture({ 'package.json': EXPRESS });
    expect(exposesInterface(dir)).toBe(true);
    expect(detectContract(dir)).toBe(false);
    expect(detectTooling(dir).has('contract-first')).toBe(false);
  });

  it('interface + a root OpenAPI document → covered', () => {
    const dir = fixture({
      'package.json': EXPRESS,
      'openapi.yaml': 'openapi: 3.0.0\n',
    });
    expect(detectTooling(dir).has('contract-first')).toBe(true);
  });

  it('interface + a contract in a conventional subdir (api/openapi.json) → covered', () => {
    const dir = fixture({
      'package.json': EXPRESS,
      'api/openapi.json': '{"openapi":"3.0.0"}',
    });
    expect(detectContract(dir)).toBe(true);
    expect(detectTooling(dir).has('contract-first')).toBe(true);
  });

  it('interface + a *.proto → covered', () => {
    const dir = fixture({
      'package.json': EXPRESS,
      'proto/service.proto': 'syntax = "proto3";\n',
    });
    expect(detectTooling(dir).has('contract-first')).toBe(true);
  });

  it('interface + a GraphQL SDL → covered', () => {
    const dir = fixture({
      'package.json': EXPRESS,
      'schema.graphql': 'type Query { ok: Boolean }\n',
    });
    expect(detectTooling(dir).has('contract-first')).toBe(true);
  });
});

describe('contract-first: JSON Schema is a contract only under contracts/ (adversarial R-1)', () => {
  it('interface + a bare config.schema.json at root → still a gap (config schema is not an interface contract)', () => {
    const dir = fixture({
      'package.json': EXPRESS,
      'config.schema.json': '{"type":"object"}',
    });
    expect(detectContract(dir)).toBe(false);
    expect(detectTooling(dir).has('contract-first')).toBe(false);
  });

  it('interface + a *.schema.json under schema/ (not contracts/) → still a gap', () => {
    const dir = fixture({
      'package.json': EXPRESS,
      'schema/data.schema.json': '{"type":"object"}',
    });
    expect(detectContract(dir)).toBe(false);
  });

  it('interface + a *.schema.json under contracts/ → covered', () => {
    const dir = fixture({
      'package.json': EXPRESS,
      'contracts/user.schema.json': '{"type":"object"}',
    });
    expect(detectContract(dir)).toBe(true);
    expect(detectTooling(dir).has('contract-first')).toBe(true);
  });
});

describe('contract-first: interface detection across ecosystems', () => {
  it.each([
    ['python fastapi', { 'pyproject.toml': '[project]\ndependencies = ["fastapi"]\n' }],
    ['java spring-web', { 'pom.xml': '<dependency>spring-boot-starter-web</dependency>' }],
    ['go gin', { 'go.mod': 'require github.com/gin-gonic/gin v1.9.1\n' }],
    ['rust axum', { 'Cargo.toml': '[dependencies]\naxum = "0.7"\n' }],
  ])('%s exposes an interface → contract required', (_name, files) => {
    const dir = fixture(files);
    expect(exposesInterface(dir)).toBe(true);
    expect(detectTooling(dir).has('contract-first')).toBe(false); // no contract yet
  });

  it('an unlisted framework is silently exempt (recorded false-negative, never a false failure)', () => {
    // a bespoke/unlisted HTTP lib is not in INTERFACE_SIGNALS → treated as no interface → exempt.
    const dir = fixture({
      'package.json': '{"dependencies":{"my-bespoke-http-lib":"^1"}}',
    });
    expect(exposesInterface(dir)).toBe(false);
    expect(detectTooling(dir).has('contract-first')).toBe(true);
  });
});
