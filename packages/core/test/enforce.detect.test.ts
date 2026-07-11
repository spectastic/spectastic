import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectTooling } from '../src/enforce/detect.js';

/** Unit tests for ecosystem-aware category detection (spec 042 T-200, SC-002). */

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-detect-'));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body, 'utf8');
  }
  return dir;
}

describe('detectTooling: per-ecosystem classification', () => {
  it('Python: pyproject markers → the right categories', () => {
    const dir = fixture({
      'pyproject.toml': '[tool.ruff]\n[tool.mypy]\n[tool.bandit]\n[tool.pytest.ini_options]\n',
    });
    const c = detectTooling(dir);
    expect(c.has('formatter')).toBe(true);
    expect(c.has('linter')).toBe(true);
    expect(c.has('type-checker')).toBe(true);
    expect(c.has('security')).toBe(true);
    expect(c.has('test-runner')).toBe(true);
  });

  it('JS/TS: biome + tsconfig + vitest', () => {
    const dir = fixture({
      'biome.json': '{}',
      'tsconfig.json': '{}',
      'vitest.config.ts': '',
    });
    const c = detectTooling(dir);
    expect(c.has('formatter')).toBe(true);
    expect(c.has('linter')).toBe(true);
    expect(c.has('type-checker')).toBe(true);
    expect(c.has('test-runner')).toBe(true);
  });

  it('Rust: Cargo covers formatter/linter/type/test; deny.toml → supply-chain', () => {
    const dir = fixture({ 'Cargo.toml': '[package]', 'deny.toml': '' });
    const c = detectTooling(dir);
    expect(c.has('formatter')).toBe(true);
    expect(c.has('linter')).toBe(true);
    expect(c.has('type-checker')).toBe(true);
    expect(c.has('test-runner')).toBe(true);
    expect(c.has('supply-chain')).toBe(true);
  });

  it('Go: golangci with gosec → linter + security', () => {
    const dir = fixture({ 'go.mod': 'module x', '.golangci.yml': 'linters:\n  enable:\n    - gosec\n' });
    const c = detectTooling(dir);
    expect(c.has('linter')).toBe(true);
    expect(c.has('security')).toBe(true);
    expect(c.has('test-runner')).toBe(true);
  });

  it('Swift + C++: config files classify', () => {
    const swift = fixture({ '.swiftlint.yml': '', '.swiftformat': '', 'Package.swift': '' });
    expect(detectTooling(swift).has('linter')).toBe(true);
    const cpp = fixture({ '.clang-tidy': '', '.clang-format': '' });
    const c = detectTooling(cpp);
    expect(c.has('linter')).toBe(true);
    expect(c.has('formatter')).toBe(true);
  });

  it('Java: gradle substrings classify by declared plugin', () => {
    const dir = fixture({ 'build.gradle': "id 'com.diffplug.spotless'\nerrorprone\ntest {}\n" });
    const c = detectTooling(dir);
    expect(c.has('formatter')).toBe(true);
    expect(c.has('linter')).toBe(true);
    expect(c.has('test-runner')).toBe(true);
  });

  it('empty project → nothing covered', () => {
    expect(detectTooling(fixture({})).size).toBe(0);
  });
});

// spec 042, coverage-enforce-category change (T-018/FR-002 amendment, FR-010).
describe('detectTooling: coverage is threshold-bearing, not bare-presence', () => {
  it('Python: pyproject.toml with fail_under → coverage', () => {
    const dir = fixture({ 'pyproject.toml': '[tool.coverage.report]\nfail_under = 90\n' });
    expect(detectTooling(dir).has('coverage')).toBe(true);
  });

  it('JS/TS: jest coverageThreshold → coverage', () => {
    const dir = fixture({ 'jest.config.js': 'module.exports = { coverageThreshold: { global: { lines: 90 } } };' });
    expect(detectTooling(dir).has('coverage')).toBe(true);
  });

  it('JS/TS: vitest thresholds → coverage', () => {
    const dir = fixture({ 'vitest.config.ts': 'export default { test: { coverage: { thresholds: { lines: 90 } } } };' });
    expect(detectTooling(dir).has('coverage')).toBe(true);
  });

  it('Java: JaCoCo verification task in build.gradle → coverage', () => {
    const dir = fixture({ 'build.gradle': "jacocoTestCoverageVerification {\n  violationRules { rule { limit { minimum = 0.9 } } }\n}\n" });
    expect(detectTooling(dir).has('coverage')).toBe(true);
  });

  it('Rust: tarpaulin.toml with fail-under → coverage', () => {
    const dir = fixture({ 'tarpaulin.toml': 'fail-under = 90\n', 'Cargo.toml': '[package]' });
    expect(detectTooling(dir).has('coverage')).toBe(true);
  });

  it('a bare coverage library with no declared threshold is NOT classified as coverage', () => {
    // package.json names @vitest/coverage-v8 but no coverageThreshold block anywhere —
    // presence of the tool must not certify the floor (adversarial-pass Risk 1).
    const dir = fixture({ 'package.json': '{"devDependencies":{"@vitest/coverage-v8":"^2.0.0"}}' });
    expect(detectTooling(dir).has('coverage')).toBe(false);
  });

  it('Go: go.mod alone never signals coverage — go test -cover is a flag, not a config file (FR-002 recorded gap)', () => {
    const dir = fixture({ 'go.mod': 'module x\n' });
    const c = detectTooling(dir);
    expect(c.has('test-runner')).toBe(true); // go test itself is still detected
    expect(c.has('coverage')).toBe(false); // but coverage never is — no signal exists for it
  });
});
