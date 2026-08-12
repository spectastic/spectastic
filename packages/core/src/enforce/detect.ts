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

// Conventional directories a checked-in contract lives in. Detection reaches into
// these named paths ONLY — a widening scoped to the contract signals (adversarial
// R-3); the other eight categories stay strictly root-only, so NFR-002's
// shallow-detection invariant is unchanged for them.
//
// Widened by spec 073-interface-detection-widening (FR-002 / D-002) from the
// original four (`api`, `proto`, `schema`, `contracts`) to the layouts build
// tools actually produce. Deliberately a finite list of EXPLICIT segments rather
// than a recursive walk: a walk would find a vendored upstream spec under
// node_modules/ and cost unbounded time on a monorepo (the alternatives matrix
// rejected it by name). The bound is asserted structurally by
// detect.contract-paths.test.ts, not merely trusted — max 4 segments, no globs.
//
// The tradeoff this accepts, recorded rather than hidden: a project using a
// convention outside this list is missed, and its escape hatch is declaring the
// path in its design (FR-003), not rearranging its tree to be detectable.
export const CONTRACT_SEARCH_PATHS: readonly string[] = [
  // The original four, unchanged — every currently-covered project keeps its verdict.
  'api',
  'proto',
  'schema',
  'contracts',
  // Additional root-level conventions.
  'openapi',
  'protos',
  'graphql',
  // Gradle/Maven: where the protobuf plugin puts generated-from sources.
  'src/main/proto',
  'src/main/resources/openapi',
  'src/main/graphql',
  // Nested module trees — buf (proto/<module>/v1), Go (api/proto/v1), and the
  // Gradle equivalent. Enumerated one level of module + one of version rather
  // than walked, so the depth stays fixed.
  'proto/v1',
  'protos/v1',
  'api/proto',
  'api/proto/v1',
  'api/v1',
  'contracts/v1',
  'openapi/v1',
];

/**
 * Roots under which a project-specific MODULE name appears before the contract
 * — buf's `proto/<module>/v1/`, Gradle's `src/main/proto/<module>/`. The module
 * name varies per project and so cannot be enumerated above; it is expanded at
 * most `MODULE_EXPANSION_DEPTH` levels, which keeps the search bounded without
 * becoming a walk. Only these roots expand — a non-proto directory never does.
 */
const MODULE_TREE_ROOTS: readonly string[] = ['proto', 'protos', 'src/main/proto', 'api/proto'];

/**
 * How many project-named levels may sit between a MODULE_TREE_ROOT and the
 * contract file — `<root>/<module>/` and `<root>/<module>/<version>/`. Two is
 * the deepest real convention (buf); a third would start finding unrelated
 * trees, which is exactly the recursive-walk failure D-002 rejects.
 */
const MODULE_EXPANSION_DEPTH = 2;

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

/** The immediate subdirectory names of `dir`, or [] if it is missing/unreadable. */
function subdirsOf(cwd: string, dir: string): string[] {
  try {
    return readdirSync(join(cwd, dir), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Expand a module-tree root into the bounded set of project-named directories
 * beneath it — `<root>/<module>` and `<root>/<module>/<version>`. Iterative and
 * hard-capped at MODULE_EXPANSION_DEPTH, so it can never become a walk: a
 * contract buried deeper than the convention allows is a recorded miss, not a
 * reason to recurse (D-002).
 */
function expandModuleTree(cwd: string, root: string): string[] {
  const found: string[] = [];
  let frontier = [root];
  for (let depth = 0; depth < MODULE_EXPANSION_DEPTH; depth += 1) {
    const next: string[] = [];
    for (const dir of frontier) {
      for (const child of subdirsOf(cwd, dir)) {
        const path = `${dir}/${child}`;
        found.push(path);
        next.push(path);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return found;
}

/** True if a checked-in interface contract exists at the root or a conventional dir. */
export function detectContract(cwd: string): boolean {
  if (dirHasContract(cwd, '')) return true;
  if (CONTRACT_SEARCH_PATHS.some((dir) => dirHasContract(cwd, dir))) return true;
  // Only the module-tree roots expand, and only to a fixed depth (073, D-002).
  return MODULE_TREE_ROOTS.some((root) => expandModuleTree(cwd, root).some((dir) => dirHasContract(cwd, dir)));
}

// A web/RPC framework declared as a dependency signals the project EXPOSES a
// public interface (FR-014), matched by dependency name on the manifest exactly
// like the observability exporters.
//
// RECORDED CEILING (spec 073, FR-007) — narrowed by that spec, not closed:
// an interface exposed through a mechanism outside these tables is silently
// exempt. Concretely that still includes a bespoke or unlisted framework, a
// broker reached through a framework abstraction rather than a declared client,
// a raw-socket or FFI surface, and any convention newer than this list. Each is
// a FALSE-NEGATIVE, deliberately preferred over a false failure: a false failure
// trains teams to disable the gate, while a missed nudge is still covered by the
// advisory principle at standard. The escape hatch for an undetectable project
// is to DECLARE its interface in the design (FR-003 / declaredInterfaceState),
// which outranks these tables — not to rearrange itself to be detectable.
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

// Event-driven interfaces (spec 073-interface-detection-widening, FR-001).
// A message-broker or managed-bus client declared as a dependency is a public
// interface just as much as an HTTP route is — a service whose entire surface is
// published topics owes its consumers a payload contract. Matched by the
// DELIBERATE client name, following the observability category's precedent:
// never a transitive core/serialization library, which would false-positive.
//
// These are held SEPARATE from INTERFACE_SIGNALS above rather than merged into
// it, because D-003 needs to know *which kind* of signal fired: an interface
// recognised only this way reports advisory, never a hard fail (FR-004), since
// a broker client is a weaker declaration of public surface than a web
// framework and cannot distinguish publishing from consuming.
const EVENT_INTERFACE_SIGNALS: readonly FileSignal[] = [
  // JS/TS — quoted names avoid substring false-positives, as above.
  { file: 'package.json', contains: '"kafkajs"' },
  { file: 'package.json', contains: '"@confluentinc/kafka-javascript"' },
  { file: 'package.json', contains: '"amqplib"' },
  { file: 'package.json', contains: '"rhea"' },
  { file: 'package.json', contains: '"nats"' },
  { file: 'package.json', contains: '"pulsar-client"' },
  { file: 'package.json', contains: '"@aws-sdk/client-sqs"' },
  { file: 'package.json', contains: '"@aws-sdk/client-sns"' },
  { file: 'package.json', contains: '"@aws-sdk/client-eventbridge"' },
  { file: 'package.json', contains: '"@azure/service-bus"' },
  { file: 'package.json', contains: '"@google-cloud/pubsub"' },
  // Python
  { file: 'pyproject.toml', contains: 'kafka-python' },
  { file: 'pyproject.toml', contains: 'confluent-kafka' },
  { file: 'pyproject.toml', contains: 'aiokafka' },
  { file: 'pyproject.toml', contains: 'pika' },
  { file: 'pyproject.toml', contains: 'aio-pika' },
  { file: 'pyproject.toml', contains: 'nats-py' },
  { file: 'pyproject.toml', contains: 'pulsar-client' },
  { file: 'pyproject.toml', contains: 'azure-servicebus' },
  { file: 'pyproject.toml', contains: 'google-cloud-pubsub' },
  { file: 'requirements.txt', contains: 'kafka-python' },
  { file: 'requirements.txt', contains: 'confluent-kafka' },
  { file: 'requirements.txt', contains: 'aiokafka' },
  { file: 'requirements.txt', contains: 'pika' },
  { file: 'requirements.txt', contains: 'nats-py' },
  { file: 'requirements.txt', contains: 'azure-servicebus' },
  { file: 'requirements.txt', contains: 'google-cloud-pubsub' },
  // Java
  { file: 'pom.xml', contains: 'spring-kafka' },
  { file: 'pom.xml', contains: 'kafka-clients' },
  { file: 'pom.xml', contains: 'spring-boot-starter-amqp' },
  { file: 'pom.xml', contains: 'amqp-client' },
  { file: 'pom.xml', contains: 'jnats' },
  { file: 'pom.xml', contains: 'pulsar-client' },
  { file: 'pom.xml', contains: 'quarkus-smallrye-reactive-messaging' },
  { file: 'build.gradle', contains: 'spring-kafka' },
  { file: 'build.gradle', contains: 'kafka-clients' },
  { file: 'build.gradle', contains: 'spring-boot-starter-amqp' },
  { file: 'build.gradle', contains: 'amqp-client' },
  { file: 'build.gradle', contains: 'pulsar-client' },
  // Go
  { file: 'go.mod', contains: 'IBM/sarama' },
  { file: 'go.mod', contains: 'Shopify/sarama' },
  { file: 'go.mod', contains: 'segmentio/kafka-go' },
  { file: 'go.mod', contains: 'confluentinc/confluent-kafka-go' },
  { file: 'go.mod', contains: 'nats-io/nats.go' },
  { file: 'go.mod', contains: 'rabbitmq/amqp091-go' },
  { file: 'go.mod', contains: 'streadway/amqp' },
  { file: 'go.mod', contains: 'apache/pulsar-client-go' },
  { file: 'go.mod', contains: 'aws-sdk-go-v2/service/sqs' },
  { file: 'go.mod', contains: 'aws-sdk-go-v2/service/sns' },
  { file: 'go.mod', contains: 'cloud.google.com/go/pubsub' },
  // Rust
  { file: 'Cargo.toml', contains: 'rdkafka' },
  { file: 'Cargo.toml', contains: 'lapin' },
  { file: 'Cargo.toml', contains: 'async-nats' },
  { file: 'Cargo.toml', contains: 'pulsar' },
  { file: 'Cargo.toml', contains: 'aws-sdk-sqs' },
  { file: 'Cargo.toml', contains: 'aws-sdk-sns' },
];

/**
 * How a project's public interface was recognised (073, D-003). The two flags
 * are independent — a service can expose both an HTTP surface and an event
 * stream, and one recognised *only* by `event` takes the advisory path (FR-004)
 * rather than hard-failing the floor.
 */
export interface InterfaceEvidence {
  /** An HTTP / GraphQL / gRPC framework is declared. */
  http: boolean;
  /** A message-broker or managed-bus client is declared. */
  event: boolean;
}

/** Classify how (if at all) the project declares a public interface (073, FR-001). */
export function interfaceEvidence(cwd: string): InterfaceEvidence {
  return {
    http: INTERFACE_SIGNALS.some((sig) => signalMatches(cwd, sig)),
    event: EVENT_INTERFACE_SIGNALS.some((sig) => signalMatches(cwd, sig)),
  };
}

/** True if the project declares any public interface — HTTP/RPC/GraphQL or event-driven (FR-014). */
export function exposesInterface(cwd: string): boolean {
  const evidence = interfaceEvidence(cwd);
  return evidence.http || evidence.event;
}

/**
 * What a project's own design artifacts DECLARE about its interface (073,
 * FR-003 / D-004) — authored intent, which outranks inference in both
 * directions because dependency matching cannot tell a publisher from a
 * consumer, nor a project's own contract from one it vendored.
 *
 * `null` when the project declares nothing (no design, no <spec-contract>, or
 * an unreadable one) — inference then runs exactly as before.
 */
/** One declared contract path, carrying the design that declared it (FR-008). */
export interface DeclaredContractPath {
  /** The path as declared, relative to the project root. */
  path: string;
  /** The spec directory whose design declared it — provenance for any report. */
  specId: string;
  /**
   * Whether the declaring spec is ratified. An unresolved path from a
   * non-ratified (Draft, Blocked, unreadable) design is advisory, never a gap:
   * declaring the contract a spec is about to create must not break the build.
   */
  ratified: boolean;
}

export interface ContractDeclarationState {
  /** The union of declared paths across every contributing design. */
  declaredPaths: DeclaredContractPath[];
  /** True when at least one design was read and none declares an interface. */
  declaresNoInterface: boolean;
}

/** Lifecycle states whose designs contribute nothing — superseding retires what it declared. */
const RETIRED_STATES = new Set(['superseded', 'deprecated']);

/** Read a design's own `<spec-status>` pill, lowercased; `null` when absent or unreadable. */
function designStatus(html: string): string | null {
  return /<spec-status\b[^>]*\bvalue=["']([^"']*)["']/i.exec(html)?.[1]?.toLowerCase() ?? null;
}

/**
 * Every design's `<spec-contract>` declarations, composed (073 FR-003 as
 * amended, FR-008).
 *
 * Declarations ACCUMULATE rather than shadow. The previous implementation
 * returned inside the newest design carrying any declaration, which made a
 * per-feature `shape="none"` on an unrelated slice a project-wide disclaimer —
 * silently voiding an earlier declaration that a contract *is* owed, and
 * reporting `contract-first` covered for a project that publishes an API.
 *
 * Status is read from the design being parsed rather than from its sibling
 * `spec.html`: the bundle flips together (REQ-LIFECYCLE-005), so the value is
 * the same, and reading it here costs no additional file access — which is why
 * NFR-001's budget is unaffected by the composition.
 *
 * `null` when no contributing design carries a declaration at all — inference
 * then runs exactly as before.
 */
export function declaredInterfaceState(cwd: string): ContractDeclarationState | null {
  let specDirs: string[];
  try {
    specDirs = readdirSync(join(cwd, 'specs'), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return null; // no specs/ — nothing declared
  }

  const declaredPaths: DeclaredContractPath[] = [];
  let sawDeclaration = false;
  let sawNonNone = false;

  for (const specId of specDirs) {
    let html: string;
    try {
      html = readFileSync(join(cwd, 'specs', specId, 'design.html'), 'utf8');
    } catch {
      continue; // no design in this spec dir
    }
    const contracts = readDesignContracts(html, specId);
    if (contracts === null) continue; // declares nothing, or retired
    sawDeclaration = true;
    declaredPaths.push(...contracts.paths);
    sawNonNone ||= contracts.sawNonNone;
  }

  if (!sawDeclaration) return null;
  return { declaredPaths, declaresNoInterface: !sawNonNone && declaredPaths.length === 0 };
}

/**
 * One design's contribution: its `<spec-contract>` declarations tagged with the
 * declaring spec and whether that spec is ratified. `null` when the design
 * contributes nothing — either it carries no declaration, or its spec is
 * Superseded/Deprecated and its declarations are retired (FR-008).
 *
 * Attribute-level reads rather than a full parse: this module is the
 * filesystem-facing detector and must not take a parser dependency, and a
 * malformed design must degrade to "declares nothing", never throw (D-004).
 */
function readDesignContracts(
  html: string,
  specId: string,
): { paths: DeclaredContractPath[]; sawNonNone: boolean } | null {
  const declarations = [...html.matchAll(/<spec-contract\b([^>]*)>/gi)];
  if (declarations.length === 0) return null;

  const status = designStatus(html);
  // Superseding a spec is the lifecycle's own act of retiring what it declared,
  // so a retired design must not keep binding the project — otherwise a
  // contract could never be retired through the mechanism built for it.
  if (status !== null && RETIRED_STATES.has(status)) return null;
  // Unreadable status ⇒ Draft. The conservative direction: it can only
  // downgrade a hard gap to advisory, never invent one.
  const ratified = status === 'accepted';

  const paths: DeclaredContractPath[] = [];
  let sawNonNone = false;
  for (const [, attrs = ''] of declarations) {
    const shape = /\bshape=["']([^"']*)["']/i.exec(attrs)?.[1]?.toLowerCase();
    const path = /\bpath=["']([^"']+)["']/i.exec(attrs)?.[1];
    if (shape !== undefined && shape !== 'none') sawNonNone = true;
    if (path !== undefined) paths.push({ path, specId, ratified });
  }
  return { paths, sawNonNone };
}

/**
 * Declared contract paths that do not resolve on disk, with the spec that
 * declared each (073 FR-008). The provenance is what makes the finding
 * actionable — a reader told a path is missing cannot act without knowing which
 * spec asked for it.
 */
export function unresolvedDeclaredContracts(cwd: string): DeclaredContractPath[] {
  const declared = declaredInterfaceState(cwd);
  if (declared === null) return [];
  return declared.declaredPaths.filter((p) => !existsSync(join(cwd, p.path)));
}

// --- Contract-checked rung (spec 074-contract-checked-tier) ------------------
// At verified and above, holding a contract also requires a configured LINTER
// and a configured breaking-change DIFFER. Per FR-002 / D-002 the signal is a
// declared CONFIGURATION — a ruleset file, a CI invocation — never the mere
// presence of a tool as a dependency: an installed linter that no configuration
// ever runs certifies nothing, exactly as coverage counts a declared threshold
// rather than a coverage library.
//
// Per D-004 / NFR-001 this reads config files and CI definitions as TEXT and
// spawns no subprocess under any circumstance: the engine detects
// configuration, it does not run linters.

/** CI definition files scanned as text for a tool invocation. */
const CI_DEFINITION_FILES: readonly string[] = [
  '.github/workflows/ci.yml',
  '.github/workflows/ci.yaml',
  '.github/workflows/main.yml',
  '.github/workflows/main.yaml',
  '.gitlab-ci.yml',
  'Makefile',
  'justfile',
];

/** A configured-check signal: a ruleset file, or a tool invocation in CI. */
interface CheckSignal {
  /** Config files whose mere existence declares the check. */
  configFiles?: readonly string[];
  /** A config file that must also CONTAIN a substring (e.g. buf's breaking stanza). */
  configContains?: readonly { file: string; contains: string }[];
  /** Command names whose appearance in a CI definition declares the check. */
  ciCommands?: readonly string[];
}

/** Per-format linter and differ signals. Extending is a data edit. */
const CONTRACT_CHECK_SIGNALS: Readonly<Record<string, { linter: CheckSignal; differ: CheckSignal }>> = {
  openapi: {
    linter: {
      configFiles: ['.spectral.yaml', '.spectral.yml', '.spectral.json', '.spectral.js', 'spectral.yaml'],
      ciCommands: ['spectral lint', 'redocly lint', 'vacuum lint'],
    },
    differ: { ciCommands: ['oasdiff', 'openapi-diff', 'redocly diff'] },
  },
  proto: {
    linter: { configContains: [{ file: 'buf.yaml', contains: 'lint' }], ciCommands: ['buf lint'] },
    differ: { configContains: [{ file: 'buf.yaml', contains: 'breaking' }], ciCommands: ['buf breaking'] },
  },
  graphql: {
    linter: {
      configFiles: ['.graphqlrc', '.graphqlrc.yml', '.graphqlrc.yaml', '.graphql-eslintrc.json'],
      ciCommands: ['graphql-eslint', 'graphql-schema-linter'],
    },
    differ: { ciCommands: ['graphql-inspector diff'] },
  },
  asyncapi: {
    linter: {
      configFiles: ['.spectral.yaml', '.spectral.yml', '.spectral.json'],
      ciCommands: ['spectral lint', 'asyncapi validate'],
    },
    differ: { ciCommands: ['asyncapi diff'] },
  },
};

/** One declared contract paired with the state of its two checks (074, FR-004). */
export interface ContractCheckState {
  /** Project-relative path of the contract file. */
  path: string;
  /** Contract format — the key into the signal and capability tables. */
  format: string;
  linted: boolean;
  diffed: boolean;
}

/** Infer a contract's format from its filename, or null if it is not a contract. */
function contractFormatOf(name: string): string | null {
  const lower = name.toLowerCase();
  if (/^asyncapi\.(ya?ml|json)$/.test(lower)) return 'asyncapi';
  if (/^(openapi|swagger)\.(ya?ml|json)$/.test(lower)) return 'openapi';
  if (lower.endsWith('.proto')) return 'proto';
  if (lower.endsWith('.graphql') || lower.endsWith('.graphqls')) return 'graphql';
  return null;
}

/** True if any CI definition invokes one of `commands`. Text-only; no spawn. */
function ciInvokes(cwd: string, commands: readonly string[]): boolean {
  for (const file of CI_DEFINITION_FILES) {
    let text: string;
    try {
      text = readFileSync(join(cwd, file), 'utf8');
    } catch {
      continue;
    }
    if (commands.some((cmd) => text.includes(cmd))) return true;
  }
  return false;
}

/** True if the signal's declared configuration is present (FR-002 — never a bare dependency). */
function checkIsConfigured(cwd: string, signal: CheckSignal): boolean {
  if (signal.configFiles?.some((f) => existsSync(join(cwd, f)))) return true;
  if (
    signal.configContains?.some(({ file, contains }) => {
      try {
        return readFileSync(join(cwd, file), 'utf8').includes(contains);
      } catch {
        return false;
      }
    })
  ) {
    return true;
  }
  return signal.ciCommands !== undefined && ciInvokes(cwd, signal.ciCommands);
}

/**
 * Pair every checked-in contract with the state of its linter and differ
 * (074, FR-004). One entry per contract, so the report can name which contract
 * and which half is short rather than a bare category verdict.
 */
export function detectContractChecks(cwd: string): ContractCheckState[] {
  const found: ContractCheckState[] = [];
  const seenFormats = new Set<string>();

  const searchDirs = ['', ...CONTRACT_SEARCH_PATHS, ...MODULE_TREE_ROOTS.flatMap((r) => expandModuleTree(cwd, r))];
  for (const dir of searchDirs) {
    let names: string[];
    try {
      names = readdirSync(dir === '' ? cwd : join(cwd, dir));
    } catch {
      continue;
    }
    for (const name of names) {
      const format = contractFormatOf(name);
      if (format === null) continue;
      // One entry per FORMAT: the rung's checks are configured per format, so a
      // second .proto adds no new information and would make the report noisy.
      if (seenFormats.has(format)) continue;
      seenFormats.add(format);
      const signals = CONTRACT_CHECK_SIGNALS[format];
      found.push({
        path: dir === '' ? name : `${dir}/${name}`,
        format,
        linted: signals !== undefined && checkIsConfigured(cwd, signals.linter),
        diffed: signals !== undefined && checkIsConfigured(cwd, signals.differ),
      });
    }
  }

  return found;
}

/**
 * True when contract-first should report at ADVISORY strength rather than
 * hard-failing (073 FR-004 / D-003): the project's interface is recognised
 * *only* through an event-driven signal, and no contract is checked in. An
 * HTTP/RPC surface alongside it keeps the gate hard, exactly as today.
 *
 * A DECLARED contract path is authored intent, not a weak inference, so it
 * keeps the gate hard too — the advisory strength exists because a broker
 * dependency cannot distinguish publishing from consuming, and a declaration
 * resolves exactly that ambiguity (D-004).
 */
export function contractFirstIsAdvisory(cwd: string): boolean {
  if (contractFirstCovered(cwd)) return false;

  const declared = declaredInterfaceState(cwd);
  if (declared !== null && declared.declaredPaths.length > 0) {
    // A declaration resolves the publisher/consumer ambiguity, so the
    // event-only advisory below no longer applies. What remains is FR-008: if
    // the project is uncovered ONLY because non-ratified designs name paths
    // that do not exist yet, that is work in progress, not a gap. A single
    // unresolved path from a ratified design makes it a gap outright.
    const unresolved = declared.declaredPaths.filter((p) => !existsSync(join(cwd, p.path)));
    return unresolved.length > 0 && unresolved.every((p) => !p.ratified);
  }

  const evidence = interfaceEvidence(cwd);
  return evidence.event && !evidence.http;
}

/**
 * Whether contract-first is satisfied (073, FR-003 / D-004). Precedence is the
 * load-bearing part, and it runs strictly in this order:
 *
 *   1. A DECLARATION, where the design makes one — it outranks inference in
 *      both directions, since dependency/filesystem matching can tell neither a
 *      publisher from a consumer nor an owned contract from a vendored one.
 *   2. Otherwise INFERENCE — a checked-in contract, or no detected interface.
 *
 * Reversing 1 and 2 would make a design's stated intent unable to correct a
 * wrong guess, which is the only reason the declaration exists.
 */
function contractFirstCovered(cwd: string): boolean {
  const declared = declaredInterfaceState(cwd);
  if (declared !== null) {
    // Declared "no interface" → nothing is owed, whatever the manifest says.
    if (declared.declaresNoInterface) return true;
    // Declared a path → it must resolve. A different contract elsewhere on disk
    // does not satisfy a declaration naming this one.
    if (declared.declaredPaths.length > 0) {
      return declared.declaredPaths.every((p) => existsSync(join(cwd, p.path)));
    }
  }
  return detectContract(cwd) || !exposesInterface(cwd);
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
  // contract-first (FR-014): interface-gated, with declaration taking precedence
  // over inference (073 FR-003). See contractFirstCovered for the ordering; in
  // brief — a design's declaration decides where it makes one, otherwise the gate
  // fails safe on the antecedent (no detected interface → exempt), needing no
  // FR-010 entry. An event-only recognition is advisory, never blocking (FR-004).
  if (contractFirstCovered(cwd)) covered.add('contract-first');
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

// --- User-interface detection (spec 093-design-visual-section) --------------
// The antecedent for the design's Visual surface section: a project with no
// user interface is never asked about screens, tokens or contexts (FR-002).
//
// Two mechanisms, because one is not enough. Manifest signals cover every
// ecosystem that declares its UI framework as a dependency. One bounded read of
// the project root covers the one that cannot: SwiftUI, UIKit and AppKit ship
// in the platform SDK and are reached by `import`, never declared, so a native
// Apple application's only root-level marker is its project directory's own
// suffix (FR-003, design D-004).
//
// Every signal is attributable to a named platform or framework — nothing is
// matched heuristically — and the bounds are asserted by a test rather than
// trusted (NFR-003): at most 20 enumerated paths, none deeper than 4 segments,
// 0 globs, and at most 1 directory read.

/** UI framework signals, by named platform. Quoted names avoid substring
 *  false-positives — "reactive-streams" must not read as "react". */
const UI_SIGNALS: readonly FileSignal[] = [
  // JS/TS — application frameworks and the meta-frameworks built on them.
  { file: 'package.json', contains: '"react"' },
  { file: 'package.json', contains: '"react-native"' },
  { file: 'package.json', contains: '"vue"' },
  { file: 'package.json', contains: '"svelte"' },
  { file: 'package.json', contains: '"@angular/core"' },
  { file: 'package.json', contains: '"solid-js"' },
  { file: 'package.json', contains: '"preact"' },
  { file: 'package.json', contains: '"lit"' },
  { file: 'package.json', contains: '"next"' },
  { file: 'package.json', contains: '"nuxt"' },
  { file: 'package.json', contains: '"astro"' },
  { file: 'package.json', contains: '"expo"' },
  { file: 'package.json', contains: '"electron"' },
  // Python
  { file: 'pyproject.toml', contains: 'streamlit' },
  { file: 'pyproject.toml', contains: 'PyQt' },
  { file: 'pyproject.toml', contains: 'kivy' },
  { file: 'requirements.txt', contains: 'streamlit' },
  // Dart
  { file: 'pubspec.yaml', contains: 'flutter' },
  // Android / Kotlin
  { file: 'build.gradle', contains: 'com.android.application' },
  { file: 'build.gradle', contains: 'androidx.compose' },
  { file: 'build.gradle.kts', contains: 'com.android.application' },
  { file: 'build.gradle.kts', contains: 'androidx.compose' },
  // Apple, where a project file rather than a dependency carries the signal.
  { file: 'Project.swift' },
  { file: 'Podfile' },
];

/**
 * The distinct paths the detector will stat — the bound NFR-003 names, derived
 * from the signal table rather than restated beside it, so the two cannot drift.
 */
export const UI_SIGNAL_PATHS: readonly string[] = [...new Set(UI_SIGNALS.map((s) => s.file))];

/**
 * Root-entry suffixes that mark a project the platform SDK's UI frameworks are
 * reached from. Hand-enumerated, and the only reason a directory read exists
 * here at all — see design D-004 for the reading of NFR-003 this takes.
 */
export const UI_DIR_SUFFIXES: readonly string[] = ['.xcodeproj', '.xcworkspace'];

export interface UserInterfaceDetection {
  /** True when at least one signal fired. */
  detected: boolean;
  /** The signals that fired, so a finding can say why rather than assert. */
  signals: string[];
}

/**
 * Whether this project appears to have a user interface. Inference only — a
 * design's own declaration outranks it in both directions (FR-004), which
 * `userInterfaceState` composes. Fails safe on the antecedent: a project it
 * cannot classify is treated as having no interface, so the gate never fires
 * on a project it merely failed to understand.
 */
export function detectUserInterface(cwd: string): UserInterfaceDetection {
  const signals: string[] = [];

  for (const sig of UI_SIGNALS) {
    if (!signalMatches(cwd, sig)) continue;
    signals.push(sig.contains === undefined ? sig.file : `${sig.file}:${sig.contains}`);
  }

  // The one directory read (design D-004). Depth 1, no recursion, no glob
  // engine — the suffix list above is the whole pattern language.
  try {
    for (const entry of readdirSync(cwd, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (UI_DIR_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) signals.push(entry.name);
    }
  } catch {
    // An unreadable root contributes nothing, exactly as an unreadable
    // manifest does. Never a throw, never an invented interface.
  }

  return { detected: signals.length > 0, signals };
}

export { ALL_CATEGORIES };
