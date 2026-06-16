# Changelog

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
