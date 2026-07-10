import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EnforcementCategory } from './types.js';

/**
 * Ecosystem-aware enforcement-category detection (spec 042, D-002 / FR-002).
 *
 * A category is "covered" if any signal for it is present in the project root.
 * A signal is a root config/manifest file, optionally gated on a substring
 * (`contains`) so a shared manifest (pyproject.toml, build.gradle, package.json)
 * can satisfy different categories by what it declares. Deliberately shallow —
 * root-only, no recursion — to stay deterministic and fast (NFR-002). Extending
 * detection is a data edit to this table (respecting brownfield: we report gaps,
 * never prescribe a specific tool).
 */

export interface Signal {
  ecosystem: string;
  category: EnforcementCategory;
  /** Root-relative file that must exist. */
  file: string;
  /** If set, the file must also contain this substring. */
  contains?: string;
}

export const SIGNALS: readonly Signal[] = [
  // --- Python --------------------------------------------------------------
  { ecosystem: 'python', category: 'formatter', file: 'pyproject.toml', contains: '[tool.ruff' },
  { ecosystem: 'python', category: 'formatter', file: 'pyproject.toml', contains: '[tool.black]' },
  { ecosystem: 'python', category: 'formatter', file: '.ruff.toml' },
  { ecosystem: 'python', category: 'linter', file: 'pyproject.toml', contains: '[tool.ruff' },
  { ecosystem: 'python', category: 'linter', file: '.ruff.toml' },
  { ecosystem: 'python', category: 'linter', file: '.flake8' },
  { ecosystem: 'python', category: 'linter', file: '.pylintrc' },
  { ecosystem: 'python', category: 'type-checker', file: 'pyproject.toml', contains: '[tool.mypy]' },
  { ecosystem: 'python', category: 'type-checker', file: 'mypy.ini' },
  { ecosystem: 'python', category: 'type-checker', file: 'pyrightconfig.json' },
  { ecosystem: 'python', category: 'security', file: 'pyproject.toml', contains: '[tool.bandit]' },
  { ecosystem: 'python', category: 'security', file: '.bandit' },
  { ecosystem: 'python', category: 'test-runner', file: 'pyproject.toml', contains: '[tool.pytest' },
  { ecosystem: 'python', category: 'test-runner', file: 'pytest.ini' },
  { ecosystem: 'python', category: 'test-runner', file: 'tox.ini' },

  // --- JS / TS -------------------------------------------------------------
  { ecosystem: 'js', category: 'formatter', file: 'biome.json' },
  { ecosystem: 'js', category: 'formatter', file: '.prettierrc' },
  { ecosystem: 'js', category: 'formatter', file: '.prettierrc.json' },
  { ecosystem: 'js', category: 'formatter', file: 'prettier.config.js' },
  { ecosystem: 'js', category: 'linter', file: 'biome.json' },
  { ecosystem: 'js', category: 'linter', file: '.eslintrc' },
  { ecosystem: 'js', category: 'linter', file: '.eslintrc.json' },
  { ecosystem: 'js', category: 'linter', file: '.eslintrc.cjs' },
  { ecosystem: 'js', category: 'linter', file: 'eslint.config.js' },
  { ecosystem: 'js', category: 'linter', file: 'eslint.config.mjs' },
  { ecosystem: 'js', category: 'type-checker', file: 'tsconfig.json' },
  { ecosystem: 'js', category: 'security', file: '.semgrep.yml' },
  { ecosystem: 'js', category: 'supply-chain', file: 'renovate.json' },
  { ecosystem: 'js', category: 'test-runner', file: 'vitest.config.ts' },
  { ecosystem: 'js', category: 'test-runner', file: 'vitest.config.js' },
  { ecosystem: 'js', category: 'test-runner', file: 'jest.config.js' },
  { ecosystem: 'js', category: 'test-runner', file: 'jest.config.ts' },
  { ecosystem: 'js', category: 'test-runner', file: 'package.json', contains: '"vitest"' },
  { ecosystem: 'js', category: 'test-runner', file: 'package.json', contains: '"jest"' },

  // --- Java / JVM ----------------------------------------------------------
  { ecosystem: 'java', category: 'formatter', file: 'build.gradle', contains: 'spotless' },
  { ecosystem: 'java', category: 'formatter', file: '.editorconfig' },
  { ecosystem: 'java', category: 'linter', file: 'build.gradle', contains: 'errorprone' },
  { ecosystem: 'java', category: 'linter', file: 'build.gradle', contains: 'spotbugs' },
  { ecosystem: 'java', category: 'linter', file: 'build.gradle', contains: 'checkstyle' },
  { ecosystem: 'java', category: 'linter', file: 'checkstyle.xml' },
  { ecosystem: 'java', category: 'type-checker', file: 'build.gradle', contains: 'nullaway' },
  { ecosystem: 'java', category: 'security', file: 'build.gradle', contains: 'findsecbugs' },
  { ecosystem: 'java', category: 'security', file: 'build.gradle', contains: 'dependency-check' },
  { ecosystem: 'java', category: 'supply-chain', file: 'build.gradle', contains: 'dependency-check' },
  { ecosystem: 'java', category: 'test-runner', file: 'build.gradle', contains: 'test' },
  { ecosystem: 'java', category: 'test-runner', file: 'pom.xml' },

  // --- Go ------------------------------------------------------------------
  { ecosystem: 'go', category: 'formatter', file: 'go.mod' }, // gofmt ships with the toolchain
  { ecosystem: 'go', category: 'linter', file: '.golangci.yml' },
  { ecosystem: 'go', category: 'linter', file: '.golangci.yaml' },
  { ecosystem: 'go', category: 'security', file: '.golangci.yml', contains: 'gosec' },
  { ecosystem: 'go', category: 'test-runner', file: 'go.mod' }, // go test is built in

  // --- Rust ----------------------------------------------------------------
  { ecosystem: 'rust', category: 'formatter', file: 'Cargo.toml' }, // rustfmt ships with the toolchain
  { ecosystem: 'rust', category: 'formatter', file: 'rustfmt.toml' },
  { ecosystem: 'rust', category: 'linter', file: 'Cargo.toml' }, // clippy ships with the toolchain
  { ecosystem: 'rust', category: 'linter', file: 'clippy.toml' },
  { ecosystem: 'rust', category: 'type-checker', file: 'Cargo.toml' }, // the compiler
  { ecosystem: 'rust', category: 'supply-chain', file: 'deny.toml' },
  { ecosystem: 'rust', category: 'security', file: 'audit.toml' },
  { ecosystem: 'rust', category: 'test-runner', file: 'Cargo.toml' }, // cargo test is built in

  // --- Swift ---------------------------------------------------------------
  { ecosystem: 'swift', category: 'formatter', file: '.swiftformat' },
  { ecosystem: 'swift', category: 'linter', file: '.swiftlint.yml' },
  { ecosystem: 'swift', category: 'linter', file: '.swiftlint.yaml' },
  { ecosystem: 'swift', category: 'test-runner', file: 'Package.swift' },

  // --- C / C++ -------------------------------------------------------------
  { ecosystem: 'cpp', category: 'formatter', file: '.clang-format' },
  { ecosystem: 'cpp', category: 'linter', file: '.clang-tidy' },
  { ecosystem: 'cpp', category: 'linter', file: '.cppcheck' },
];

const ALL_CATEGORIES: readonly EnforcementCategory[] = [
  'formatter',
  'linter',
  'type-checker',
  'security',
  'supply-chain',
  'test-runner',
];

function signalMatches(cwd: string, sig: Signal): boolean {
  const path = join(cwd, sig.file);
  if (!existsSync(path)) return false;
  if (sig.contains === undefined) return true;
  try {
    return readFileSync(path, 'utf8').includes(sig.contains);
  } catch {
    return false;
  }
}

/** The set of enforcement categories the project's root config covers. */
export function detectTooling(cwd: string): Set<EnforcementCategory> {
  const covered = new Set<EnforcementCategory>();
  for (const sig of SIGNALS) {
    if (covered.has(sig.category)) continue;
    if (signalMatches(cwd, sig)) covered.add(sig.category);
  }
  return covered;
}

/**
 * The set of ecosystems present in the project (spec 043) — any ecosystem with
 * a matching signal. Reuses the same signal table as detectTooling so stack
 * ignore-resolution and enforcement detection can't drift.
 */
export function detectEcosystems(cwd: string): Set<string> {
  const found = new Set<string>();
  for (const sig of SIGNALS) {
    if (found.has(sig.ecosystem)) continue;
    if (signalMatches(cwd, sig)) found.add(sig.ecosystem);
  }
  return found;
}

export { ALL_CATEGORIES };
