# Changelog

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
