import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
  {
    ecosystem: 'python',
    category: 'formatter',
    file: 'pyproject.toml',
    contains: '[tool.ruff',
  },
  {
    ecosystem: 'python',
    category: 'formatter',
    file: 'pyproject.toml',
    contains: '[tool.black]',
  },
  { ecosystem: 'python', category: 'formatter', file: '.ruff.toml' },
  {
    ecosystem: 'python',
    category: 'linter',
    file: 'pyproject.toml',
    contains: '[tool.ruff',
  },
  { ecosystem: 'python', category: 'linter', file: '.ruff.toml' },
  { ecosystem: 'python', category: 'linter', file: '.flake8' },
  { ecosystem: 'python', category: 'linter', file: '.pylintrc' },
  {
    ecosystem: 'python',
    category: 'type-checker',
    file: 'pyproject.toml',
    contains: '[tool.mypy]',
  },
  { ecosystem: 'python', category: 'type-checker', file: 'mypy.ini' },
  { ecosystem: 'python', category: 'type-checker', file: 'pyrightconfig.json' },
  {
    ecosystem: 'python',
    category: 'security',
    file: 'pyproject.toml',
    contains: '[tool.bandit]',
  },
  { ecosystem: 'python', category: 'security', file: '.bandit' },
  {
    ecosystem: 'python',
    category: 'test-runner',
    file: 'pyproject.toml',
    contains: '[tool.pytest',
  },
  { ecosystem: 'python', category: 'test-runner', file: 'pytest.ini' },
  { ecosystem: 'python', category: 'test-runner', file: 'tox.ini' },

  // --- JS / TS -------------------------------------------------------------
  { ecosystem: 'js', category: 'formatter', file: 'biome.json' },
  // biome.jsonc — Biome's own comment-carrying config variant (068 dogfooding
  // finding: biome.json is strict JSON and silently fails to parse with a `//`
  // comment in it; biome.jsonc is the sanctioned way to record an inline rule
  // rationale, per FR-002). Additive beside biome.json, not a replacement.
  { ecosystem: 'js', category: 'formatter', file: 'biome.jsonc' },
  { ecosystem: 'js', category: 'formatter', file: '.prettierrc' },
  { ecosystem: 'js', category: 'formatter', file: '.prettierrc.json' },
  { ecosystem: 'js', category: 'formatter', file: 'prettier.config.js' },
  { ecosystem: 'js', category: 'linter', file: 'biome.json' },
  { ecosystem: 'js', category: 'linter', file: 'biome.jsonc' },
  { ecosystem: 'js', category: 'linter', file: '.eslintrc' },
  { ecosystem: 'js', category: 'linter', file: '.eslintrc.json' },
  { ecosystem: 'js', category: 'linter', file: '.eslintrc.cjs' },
  { ecosystem: 'js', category: 'linter', file: 'eslint.config.js' },
  { ecosystem: 'js', category: 'linter', file: 'eslint.config.mjs' },
  { ecosystem: 'js', category: 'type-checker', file: 'tsconfig.json' },
  { ecosystem: 'js', category: 'security', file: '.semgrep.yml' },
  { ecosystem: 'js', category: 'supply-chain', file: 'renovate.json' },
  // 068-enterprise-enforce-floor T-310 (plan D-004): additive-only, sits beside
  // the existing Renovate row — signalMatches already joins `sig.file` against
  // cwd (T-310's grounding, detect.ts's own join-based matcher), so a
  // subdirectory-prefixed signal needs no engine change.
  { ecosystem: 'js', category: 'supply-chain', file: '.github/dependabot.yml' },
  { ecosystem: 'js', category: 'test-runner', file: 'vitest.config.ts' },
  { ecosystem: 'js', category: 'test-runner', file: 'vitest.config.js' },
  { ecosystem: 'js', category: 'test-runner', file: 'jest.config.js' },
  { ecosystem: 'js', category: 'test-runner', file: 'jest.config.ts' },
  {
    ecosystem: 'js',
    category: 'test-runner',
    file: 'package.json',
    contains: '"vitest"',
  },
  {
    ecosystem: 'js',
    category: 'test-runner',
    file: 'package.json',
    contains: '"jest"',
  },

  // --- Java / JVM ----------------------------------------------------------
  {
    ecosystem: 'java',
    category: 'formatter',
    file: 'build.gradle',
    contains: 'spotless',
  },
  { ecosystem: 'java', category: 'formatter', file: '.editorconfig' },
  {
    ecosystem: 'java',
    category: 'linter',
    file: 'build.gradle',
    contains: 'errorprone',
  },
  {
    ecosystem: 'java',
    category: 'linter',
    file: 'build.gradle',
    contains: 'spotbugs',
  },
  {
    ecosystem: 'java',
    category: 'linter',
    file: 'build.gradle',
    contains: 'checkstyle',
  },
  { ecosystem: 'java', category: 'linter', file: 'checkstyle.xml' },
  {
    ecosystem: 'java',
    category: 'type-checker',
    file: 'build.gradle',
    contains: 'nullaway',
  },
  {
    ecosystem: 'java',
    category: 'security',
    file: 'build.gradle',
    contains: 'findsecbugs',
  },
  {
    ecosystem: 'java',
    category: 'security',
    file: 'build.gradle',
    contains: 'dependency-check',
  },
  {
    ecosystem: 'java',
    category: 'supply-chain',
    file: 'build.gradle',
    contains: 'dependency-check',
  },
  {
    ecosystem: 'java',
    category: 'test-runner',
    file: 'build.gradle',
    contains: 'test',
  },
  { ecosystem: 'java', category: 'test-runner', file: 'pom.xml' },

  // --- Go ------------------------------------------------------------------
  { ecosystem: 'go', category: 'formatter', file: 'go.mod' }, // gofmt ships with the toolchain
  { ecosystem: 'go', category: 'linter', file: '.golangci.yml' },
  { ecosystem: 'go', category: 'linter', file: '.golangci.yaml' },
  {
    ecosystem: 'go',
    category: 'security',
    file: '.golangci.yml',
    contains: 'gosec',
  },
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

  // --- Coverage (spec 042, FR-002 amendment) --------------------------------
  // Threshold-bearing signals only — a bare coverage library does not imply a
  // gate (measuring and gating are separable), so `contains` matches a
  // declared threshold/check, never just the tool's presence. Go is a
  // deliberate gap: `go test -cover` is a flag, not a config file, so coverage
  // is not statically detectable there (FR-002 rationale; FR-010 keeps this
  // from becoming a false hard-failure). Swift/C++ have no established static
  // coverage-threshold config convention today — no signal, rather than a
  // guessed one.
  {
    ecosystem: 'python',
    category: 'coverage',
    file: 'pyproject.toml',
    contains: 'fail_under',
  },
  {
    ecosystem: 'python',
    category: 'coverage',
    file: '.coveragerc',
    contains: 'fail_under',
  },
  {
    ecosystem: 'python',
    category: 'coverage',
    file: 'tox.ini',
    contains: 'fail_under',
  },
  {
    ecosystem: 'js',
    category: 'coverage',
    file: 'jest.config.js',
    contains: 'coverageThreshold',
  },
  {
    ecosystem: 'js',
    category: 'coverage',
    file: 'jest.config.ts',
    contains: 'coverageThreshold',
  },
  {
    ecosystem: 'js',
    category: 'coverage',
    file: 'package.json',
    contains: 'coverageThreshold',
  },
  {
    ecosystem: 'js',
    category: 'coverage',
    file: 'vitest.config.ts',
    contains: 'thresholds',
  },
  {
    ecosystem: 'js',
    category: 'coverage',
    file: 'vitest.config.js',
    contains: 'thresholds',
  },
  {
    ecosystem: 'js',
    category: 'coverage',
    file: '.nycrc',
    contains: 'check-coverage',
  },
  {
    ecosystem: 'java',
    category: 'coverage',
    file: 'build.gradle',
    contains: 'jacocoTestCoverageVerification',
  },
  {
    ecosystem: 'java',
    category: 'coverage',
    file: 'pom.xml',
    contains: 'haltOnFailure',
  },
  {
    ecosystem: 'rust',
    category: 'coverage',
    file: 'tarpaulin.toml',
    contains: 'fail-under',
  },
  {
    ecosystem: 'rust',
    category: 'coverage',
    file: 'Cargo.toml',
    contains: 'fail-under',
  },

  // --- Observability (spec 042, observability-enforce-category change) -------
  // Match a metrics registry/exporter/starter dependency by its DELIBERATE
  // export name — never the top-level `@opentelemetry/` namespace or a
  // tracing-only core lib (`@opentelemetry/api`), which arrive transitively and
  // would false-positive. Presence is a NECESSARY signal ("monitoring is
  // possible"), not proof the /metrics endpoint is wired (FR-002 ceiling).
  // Swift and C++ have no exporter-manifest convention → no signal; they take an
  // FR-010 STRUCTURALLY_UNDETECTABLE entry (policy.ts) so they warn, not fail.
  {
    ecosystem: 'java',
    category: 'observability',
    file: 'pom.xml',
    contains: 'micrometer-registry-prometheus',
  },
  {
    ecosystem: 'java',
    category: 'observability',
    file: 'pom.xml',
    contains: 'spring-boot-starter-actuator',
  },
  {
    ecosystem: 'java',
    category: 'observability',
    file: 'pom.xml',
    contains: 'quarkus-micrometer-registry-prometheus',
  },
  {
    ecosystem: 'java',
    category: 'observability',
    file: 'pom.xml',
    contains: 'quarkus-opentelemetry',
  },
  {
    ecosystem: 'java',
    category: 'observability',
    file: 'build.gradle',
    contains: 'micrometer-registry-prometheus',
  },
  {
    ecosystem: 'java',
    category: 'observability',
    file: 'build.gradle',
    contains: 'spring-boot-starter-actuator',
  },
  {
    ecosystem: 'java',
    category: 'observability',
    file: 'build.gradle',
    contains: 'quarkus-micrometer-registry-prometheus',
  },
  {
    ecosystem: 'java',
    category: 'observability',
    file: 'build.gradle',
    contains: 'quarkus-opentelemetry',
  },
  {
    ecosystem: 'go',
    category: 'observability',
    file: 'go.mod',
    contains: 'prometheus/client_golang',
  },
  {
    ecosystem: 'go',
    category: 'observability',
    file: 'go.mod',
    contains: 'go.opentelemetry.io/otel/exporters/prometheus',
  },
  {
    ecosystem: 'js',
    category: 'observability',
    file: 'package.json',
    contains: 'prom-client',
  },
  {
    ecosystem: 'js',
    category: 'observability',
    file: 'package.json',
    contains: '@opentelemetry/exporter-prometheus',
  },
  {
    ecosystem: 'js',
    category: 'observability',
    file: 'package.json',
    contains: '@opentelemetry/sdk-metrics',
  },
  {
    ecosystem: 'python',
    category: 'observability',
    file: 'pyproject.toml',
    contains: 'prometheus-client',
  },
  {
    ecosystem: 'python',
    category: 'observability',
    file: 'pyproject.toml',
    contains: 'opentelemetry-exporter-prometheus',
  },
  {
    ecosystem: 'python',
    category: 'observability',
    file: 'requirements.txt',
    contains: 'prometheus-client',
  },
  {
    ecosystem: 'python',
    category: 'observability',
    file: 'requirements.txt',
    contains: 'opentelemetry-exporter-prometheus',
  },
  {
    ecosystem: 'rust',
    category: 'observability',
    file: 'Cargo.toml',
    contains: 'prometheus',
  },
];

// --- Contract-first (spec 042, 2026-07-11-contract-first-enforce) -------------
// Contract-first is NOT in SIGNALS: it is interface-gated (FR-014) — a gap only
// when the project exposes a detectable interface AND no contract is checked in.
// Two detection halves feed detectTooling's special case below.

/** A file-match signal without a category — used for interface-framework detection. */
type FileSignal = { file: string; contains?: string };

// Conventional directories a checked-in contract lives in. Detection reaches ONE
// level into these — a widening scoped to the contract signals ONLY (adversarial
// R-3); the other eight categories stay strictly root-only, so NFR-002's
// shallow-detection invariant is unchanged for them.
const CONTRACT_DIRS = ['api', 'proto', 'schema', 'contracts'] as const;

/** True if `name`, in directory `dir` ('' = root), is a checked-in interface contract. */
function isContractFile(name: string, dir: string): boolean {
  const lower = name.toLowerCase();
  // OpenAPI / Swagger / AsyncAPI documents by conventional name.
  if (/^(openapi|swagger|asyncapi)\.(ya?ml|json)$/.test(lower)) return true;
  // Protobuf and GraphQL SDL by extension.
  if (lower.endsWith('.proto') || lower.endsWith('.graphql') || lower.endsWith('.graphqls')) return true;
  // A bare *.schema.json is usually a config-validation schema, not an interface
  // contract, so JSON Schema counts ONLY under an explicit contracts/ dir (R-1).
  if (dir === 'contracts' && lower.endsWith('.schema.json')) return true;
  return false;
}

/** True if a directory (shallow, no recursion) holds a checked-in contract file. */
function dirHasContract(cwd: string, dir: string): boolean {
  try {
    return readdirSync(dir === '' ? cwd : join(cwd, dir)).some((name) => isContractFile(name, dir));
  } catch {
    return false; // missing/unreadable dir → no contract there
  }
}

/** True if a checked-in interface contract exists at the root or a conventional dir. */
export function detectContract(cwd: string): boolean {
  return dirHasContract(cwd, '') || CONTRACT_DIRS.some((dir) => dirHasContract(cwd, dir));
}

// A web/RPC framework declared as a dependency signals the project EXPOSES a
// public interface (FR-014), matched by dependency name on the manifest exactly
// like the observability exporters. An interface exposed via a framework outside
// this set is silently exempt — a recorded false-negative, never a false failure.
const INTERFACE_SIGNALS: readonly FileSignal[] = [
  // JS/TS — quoted names avoid substring false-positives (e.g. "express" vs "expressive").
  { file: 'package.json', contains: '"express"' },
  { file: 'package.json', contains: '"fastify"' },
  { file: 'package.json', contains: '"@nestjs/core"' },
  { file: 'package.json', contains: '"koa"' },
  { file: 'package.json', contains: '"@hapi/hapi"' },
  { file: 'package.json', contains: '"@apollo/server"' },
  { file: 'package.json', contains: '"apollo-server"' },
  { file: 'package.json', contains: '"graphql-yoga"' },
  { file: 'package.json', contains: '"@grpc/grpc-js"' },
  // Python
  { file: 'pyproject.toml', contains: 'fastapi' },
  { file: 'pyproject.toml', contains: 'flask' },
  { file: 'pyproject.toml', contains: 'django' },
  { file: 'pyproject.toml', contains: 'starlette' },
  { file: 'pyproject.toml', contains: 'aiohttp' },
  { file: 'pyproject.toml', contains: 'grpcio' },
  { file: 'pyproject.toml', contains: 'connexion' },
  { file: 'requirements.txt', contains: 'fastapi' },
  { file: 'requirements.txt', contains: 'flask' },
  { file: 'requirements.txt', contains: 'django' },
  { file: 'requirements.txt', contains: 'grpcio' },
  // Java
  { file: 'pom.xml', contains: 'spring-boot-starter-web' },
  { file: 'pom.xml', contains: 'spring-webflux' },
  { file: 'pom.xml', contains: 'jakarta.ws.rs' },
  { file: 'pom.xml', contains: 'javax.ws.rs' },
  { file: 'pom.xml', contains: 'grpc-' },
  { file: 'pom.xml', contains: 'quarkus-resteasy' },
  { file: 'build.gradle', contains: 'spring-boot-starter-web' },
  { file: 'build.gradle', contains: 'spring-webflux' },
  { file: 'build.gradle', contains: 'micronaut-http' },
  { file: 'build.gradle', contains: 'grpc-' },
  // Go
  { file: 'go.mod', contains: 'gin-gonic/gin' },
  { file: 'go.mod', contains: 'labstack/echo' },
  { file: 'go.mod', contains: 'gofiber/fiber' },
  { file: 'go.mod', contains: 'gorilla/mux' },
  { file: 'go.mod', contains: 'go-chi/chi' },
  { file: 'go.mod', contains: 'google.golang.org/grpc' },
  // Rust
  { file: 'Cargo.toml', contains: 'actix-web' },
  { file: 'Cargo.toml', contains: 'axum' },
  { file: 'Cargo.toml', contains: 'rocket' },
  { file: 'Cargo.toml', contains: 'warp' },
  { file: 'Cargo.toml', contains: 'tonic' },
  { file: 'Cargo.toml', contains: 'poem' },
  // Swift
  { file: 'Package.swift', contains: 'Vapor' },
  { file: 'Package.swift', contains: 'Hummingbird' },
  { file: 'Package.swift', contains: 'grpc-swift' },
];

/** True if the project declares a web/RPC framework — i.e. it exposes a public interface (FR-014). */
export function exposesInterface(cwd: string): boolean {
  return INTERFACE_SIGNALS.some((sig) => signalMatches(cwd, sig));
}

const ALL_CATEGORIES: readonly EnforcementCategory[] = [
  'formatter',
  'linter',
  'type-checker',
  'security',
  'supply-chain',
  'test-runner',
  'coverage',
  'observability',
  'contract-first',
];

function signalMatches(cwd: string, sig: FileSignal): boolean {
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
  // contract-first (FR-014): interface-gated. Covered if a contract is checked in,
  // OR the project exposes no detectable interface (nothing to contract). It is a
  // gap only when an interface is exposed and no contract is present — so the gate
  // fails safe on the antecedent (no interface → exempt), needing no FR-010 entry.
  if (detectContract(cwd) || !exposesInterface(cwd)) covered.add('contract-first');
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
