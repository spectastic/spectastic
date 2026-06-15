# Changelog

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
