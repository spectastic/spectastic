import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectTooling } from '../../src/commands/init/detect.js';

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
