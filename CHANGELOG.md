# Changelog

## v0.1.0-pre.9 — 2026-06-16

Second kernel verb: `triage`, plus the first concrete `ClaudeProvider`.

- **`triageCommand`** at `@spectastic/core/commands/triage` extracts the `/spectastic.triage` slash verb. Single-card + list-intake both in scope. Eight layer classifications; LLM-based with `ask<T>()` escalation on ambiguity. Caller passes `startingIdT` + `startingIdI` so the kernel stays pure (no destination paths inside).
- **`ClaudeProvider`** at `@spectastic/core/providers/claude` — first concrete `AIProvider` implementation. `chat()` via `@anthropic-ai/sdk`'s `messages.create`; `ask<T>()` via structured-prompt + JSON parse + one stricter retry; `subagent()` ships as a stub throwing "lands with 013-core-propose" so the surface is forward-looking (007 spec FR-008 + 006 D-004).
- **ANTHROPIC_API_KEY redaction**: every error from SDK calls is rewrapped as `ClaudeProviderError`; the key value is scrubbed from `.message` + `.stack` substrings. Unit-tested on a deliberately-triggered error path.
- **CLI subcommand**: `spectastic triage [description]` (reads arg or stdin); flags `--spec <id>`, `--mode single|list`, `--format human|json`. Requires `ANTHROPIC_API_KEY` in the environment; the slash-command path inside Claude Code does not.
- **List-intake heuristic**: ported verbatim from the slash-command markdown's discipline — newlines, commas/semicolons, bullet markers, numbered items, phrases like "things/items/stuff."
- **Slash-command markdown** gains an "Optional: CLI dispatch" section pointing at the new subcommand per 006 FR-009.
- **Bench unbroken**: `init-help-cold-start` p50 stays at ~99 ms (vs 150 ms budget); `@anthropic-ai/sdk` is lazy-loaded only via the `@spectastic/core/providers/claude` subpath. 72/72 tests pass (was 68; +4 new kernel triage tests).

Seven more verb extractions queued ([008](./specs/008-core-principles/spec.html) through [014](./specs/014-core-implement/spec.html)). Each follows this same shape.

## v0.1.0-pre.8 — 2026-06-16

First kernel verb extracted. Foundation for Tier 2 (MCP) + Tier 3 (VS Code) + Tier 6 (web editor) reach.

- **New package `@spectastic/core`** at `packages/core/`. Third pnpm-workspace package alongside `cli` + `schema`. Houses the verb kernel — one TypeScript module the CLI, the future MCP server, and the future VS Code extension all share. Synced version with cli + schema; published with provenance under `next`.
- **`validateCommand` extracted** to `@spectastic/core/commands/validate` per [spec 006-kernel-extraction](./specs/006-kernel-extraction/spec.html). The CLI's `validate` subcommand now imports from core; behaviour is byte-identical (same exit codes, same output formats, same finding shape). Full-project validate still returns `✓ no findings`; 68/68 tests pass (was 64, +4 from kernel unit tests).
- **Per-verb subpath exports** (`./commands/validate`, `./providers/node-fs`) keep the lazy-loading discipline. Importing `@spectastic/core` (the main entry) loads zero command code — only types. The bench's `init-help-cold-start` scenario is the regression guard.
- **Forward-looking `AIProvider` interface** declared in v1 with `chat` + `ask<T>` + `subagent` even though validate uses none of them. Means the 007-core-triage PR that lands the first Claude implementation and the 013-core-propose PR that lights up `subagent()` are both additive rather than interface-extending breaking changes.
- **Pre-1.0 versioning policy** documented in `packages/core/README.md`: breaking changes to the kernel API may land in minor version bumps until 1.0.0. Downstream consumers should pin with `~0.x.y`, not `^0.x.y`.
- **Bench regression check**: `validate-full-project` p50 184 ms (vs 175 ms M1 dev baseline = +5%, well within the ±20% NFR-002 target). All four bench scenarios within budget.
- **Publish workflow version-verify gate extended** to cover all three packages — `cli`, `schema`, `core` — must share the tag's version or the workflow fails.

Seven sibling kernel-extraction slices ([007-core-triage](./specs/007-core-triage/spec.html) through [014-core-implement](./specs/014-core-implement/spec.html)) are speccced and ready to plan once 006 ships.

## v0.1.0-pre.7 — 2026-06-16

Closes the third slicing-consistency rule: cross-file parent/child reciprocity.

- **New rule `parent-child-reciprocity`** (cross-file). For every doc with `<spec-parent specid="X">`, when X is also in the validation set, X must contain a reciprocal `<spec-out-of-scope> <li defer-to="<this-spec-id>">`. The two halves of a slice carve-out must point at each other.
- Single-direction only (child → parent). The reverse direction would over-fire on legitimate non-parent/child defer-tos.
- Fires only when both parent and child are in the validation set. Single-doc validation skips it; the test harness was extended to support multi-file directory fixtures so this rule can be exercised properly.
- Together with `spec-parent-well-formed` and `no-broken-defer-to`, this completes the slicing-consistency triplet identified by the 16 Jun 2026 audit and listed under [examples/slicing-gaps.html §5](./examples/slicing-gaps.html#deferred).
- 64 tests pass (62 → 64 from the new rule's positive/negative pair, now using the directory-fixture loader).

## v0.1.0-pre.6 — 2026-06-16

Ships the two new validator rules to npm consumers.

- **New rule `no-broken-defer-to`** (cross-file). `<spec-out-of-scope defer-to="…">` values must be `never`, `TBD` / `TBD-<topic>`, or a well-formed spec ID. The existence-of-target check fires only when the validation set contains 2+ documents, so `spectastic validate path/to/single.html` doesn't false-positive on cross-spec references. Use `spectastic validate "specs/**/*.html" "examples/**/*.html"` (or wider globs) to engage the existence check.
- **New rule `spec-parent-well-formed`** (per-file). `<spec-parent>` must declare a non-empty `specid=` attribute matching the spec-id format (`<digits>-<lower-kebab>`). Catches the common drift where an author copies `<spec-parent>` from the template but forgets to fill in the ID.
- Together the two rules form the practical lower bound on parent/child slicing consistency. Strict cross-file reciprocity remains a follow-up; see [examples/slicing-gaps.html §5](./examples/slicing-gaps.html#deferred).
- 62 tests pass (60 → 62 from the two new fixture pairs). No breaking changes for callers; the new rules emit `error`-severity findings on documents that previously validated cleanly only when those documents had the underlying defect.

## v0.1.0-pre.5 — 2026-06-16

Republish that ships the I-019 / I-020 / T-002 follow-ups already on disk.

- **`commands/spectastic.implement.md` step 8 tightened** per the new `REQ-LIFECYCLE-005` (sibling-bundling rule). The post-tick predicate is now "zero remaining unchecked checkboxes after every tick taken while the spec's status is `Draft`" — a deterministic re-evaluation rather than an LLM heuristic on "the last one," and scoped to Draft to avoid re-confirmation loops on already-flipped specs. On confirmation, all three sibling artifacts (`spec.html`, `plan.html`, `tasks.html`) flip together as one gesture.
- **`spectastic -V` now reports the actually-installed version** (I-020). Previously the CLI read its version from a hard-coded literal; now it reads the package's own `package.json` at runtime via `import.meta.url`. Cosmetic but it removes a foot-gun: the CLI is no longer able to lie about its identity.
- The CLI's top-level description was updated to "Single-file HTML spec tooling: bootstrap a project with `init`; validate spec-html artifacts with `validate`." in v0.1.0-pre.4; this republish bundles the updated commands directory under `_bundled/.claude/commands/` so `spectastic init` writes the tightened step 8 prose to new projects.

No runtime behavior changes for the `validate` or `init` subcommands themselves. Spec [meta-spec](./examples/spectastic-spec.html#REQ-LIFECYCLE-005); proposal [2026-06-16-lifecycle-sibling-bundling](./examples/changes/archive/2026-06-16-lifecycle-sibling-bundling/proposal.html).

## v0.1.0-pre.4 — 2026-06-16

npm-page polish that should have ridden with the first publish.

- **`@spectastic/cli` description** now names both subcommands (`init` + `validate`) instead of just `validate`. Previous wording underrepresented what the CLI does post-Tier-1.5.
- **`packages/cli/README.md`** authored. Previously the npm page showed "This package does not have a README"; now it surfaces the two-subcommand surface, the install line, the exit-code contract, and provenance verification.
- **`license: MIT`** added to both `package.json` files (the LICENSE file at repo root existed since 788e607 but neither package declared it — npm pages displayed `none`).
- **Keywords** added to both packages: `spectastic`, `spec-driven-development`, `specs`, `lifecycle`, `html`, `linter`, `validator`, `ci`, `sarif`, plus per-package specifics (`init`/`scaffold`/`cli` for cli; `ast`/`parse5` for schema). Helps npm search.
- **`homepage` / `repository.directory` / `bugs`** added to both — the npm "Repository" link now resolves to the right subdirectory.

No runtime behavior changes; only manifest + docs.

## v0.1.0-pre.3 — 2026-06-16

**First publish to npm.** Both `@spectastic/cli` and `@spectastic/schema` are now installable as `npm i -g @spectastic/cli@next`. Spec [004-npm-publish-workflow](./specs/004-npm-publish-workflow/spec.html).

### Publish workflow

- `.github/workflows/publish.yml` — two jobs sharing the install/build/typecheck/test gates. The `dry-run` job validates the workflow on PRs that touch it (caught two real defects in the smoke test — pnpm/`packageManager` conflict + typecheck-before-build ordering). The `publish` job verifies the tag matches both packages' versions, derives the dist-tag (pre-releases → `next`, bare semver → `latest`), publishes both with `--provenance` via GitHub OIDC, and writes a workflow summary.
- `.github/dependabot.yml` — weekly bumps for GitHub Actions and npm ecosystems. Already proven on day one: `actions/checkout` v4→v6 and `pnpm/action-setup` v4→v6 PRs both went green through the dry-run job.

### Install

```sh
npm i -g @spectastic/cli@next
spectastic init                    # bootstrap a project
spectastic validate "*.html"       # check artifacts
```

### Provenance

Each version page on npmjs.com displays a verified-source attestation linking to the originating commit and GitHub Actions run. Cryptographic signature verifiable via `npm audit signatures`.

### Known quirk

npm's first-publish behavior auto-tagged both packages on `latest` in addition to the requested `next` — for the first version, `npm view @spectastic/cli dist-tags` shows `{ next: '0.1.0-pre.3', latest: '0.1.0-pre.3' }`. Self-corrects on the next bare-semver release (the workflow will overwrite `latest` when a `vX.Y.Z` tag without a hyphen ships).

## v0.1.0-pre.2 — 2026-06-15

`spectastic init` ported to TypeScript on `@spectastic/cli`; Python implementation retired. Spec [003-init-node-port](./specs/003-init-node-port/spec.html).

### `@spectastic/cli` — new `init` subcommand

- `spectastic init` writes the canonical 16-file lifecycle structure (8 slash commands + 2 assets + 6 templates) into the current directory.
- Conflict UX via [@clack/prompts](https://github.com/natemoo-re/clack): per-file `[y/N/a/s]` with `a`-all-overwrite and `s`-all-skip shortcuts.
- `--force` bypasses prompts; non-TTY context with conflicts refuses with exit 2 and a message naming `--force`.
- Atomic plan-then-write: Ctrl-C during the prompt loop leaves zero files written.
- Templates bundled inside the published package; runtime resolves via `import.meta.url` with a dev-mode workspace fallback.

### Python implementation retired

- `scripts/spectastic` deleted (was the Python single-file CLI per [001-cli](./specs/001-cli/spec.html), now `Superseded`).
- `scripts/test_spectastic.py` deleted.
- Byte-identity parity verified manually: Python output and Node output for `spectastic init` in matched tmp dirs produce zero diffs.

### Performance fix

- Validate subcommand now lazy-imports its heavy deps (`@spectastic/schema` with parse5, tinyglobby, formatters) so `spectastic init` cold-start stays under its 500ms NFR. Validate pays the cost once when actually invoked.

## v0.1.0-pre — 2026-06-14

First Node-side packages. Spec 002-validate-cli (Tier 1 of the strategy
plan at `~/.claude/plans/serialized-whistling-sundae.md`).

### `@spectastic/schema` (new)

TypeScript module that is the grammar for the spec-html vocabulary.
Twelve rules covering the visible-failure attributes (defer-to, op,
target, status, id) plus edge cases (empty document, file-too-large).
Cross-file rule `no-duplicate-ids` scoped to topic-prefixed IDs on
`<spec-requirement>` / `<spec-decision>` — the project-wide forever
contracts named by P-3.

### `@spectastic/cli` (new)

`spectastic validate <paths...>` Node CLI. Three output formats:
- human (default; coloured terminal output via picocolors)
- json (structured Finding[] for VS Code, MCP, CI parsers)
- sarif (SARIF 2.1.0; GitHub Code Scanning + GitLab SAST both consume it)

Exit codes per FR-002: `0` clean, `1` errors, `2` usage. Glob expansion
via tinyglobby with default-ignores for `**/archive/**`,
`**/withdrawn/**`, `**/node_modules/**`, `**/dist/**`.

### Monorepo

pnpm workspaces (pacquet permitted per D-005 of the plan); TypeScript 5.x
ESM-only packages targeting Node 20 LTS; tsup builds.

### Principles

v1.0.0 → v1.0.1 via `2026-06-14-clarify-tooling-scope`: the no-build-step
non-goal scopes to the spec artifact (tooling that reads or generates
artifacts may have its own build step); the categorical "no separate CLI"
wording is now "complementary CLIs are permitted."

### CI

Example workflows for GitHub Actions and GitLab CI under
`docs/ci-examples/` show how to wire `spectastic validate` into a
SARIF-uploading CI job.

### Known follow-up

- FR-011 of the spec currently reads as "duplicate stable IDs across the
  validated set"; the implementation narrows that to topic-prefixed IDs
  on `<spec-requirement>` / `<spec-decision>` because the project's
  dual ID convention (`FR-001` spec-local, `REQ-AUTH-001` project-wide)
  doesn't support the strict reading. Queued: a `/spectastic.propose`
  to align the spec's wording with what the rule actually enforces.
