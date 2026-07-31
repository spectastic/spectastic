# @spectastic/schema

The TypeScript module form of the spec-html vocabulary's grammar. A library
consumers — `@spectastic/cli`, the future VS Code extension, the MCP server,
the kernel — import to judge spec validity against the same rules.

## Install

```sh
npm i @spectastic/schema
# or pnpm add @spectastic/schema
# or yarn add @spectastic/schema
```

## Use

```ts
import { validate, validateMany, rules, type Finding } from '@spectastic/schema';

// Single file
const findings: Finding[] = validate(htmlString, { file: 'specs/001/spec.html' });

// Multi-file (cross-file rules see the whole set)
const all = validateMany([
  { html: html1, file: 'a.html' },
  { html: html2, file: 'b.html' },
]);

// Walk the registry
for (const rule of rules) {
  console.log(rule.id, rule.scope, rule.defaultSeverity, rule.description);
}
```

## Surface

| Export        | Kind          | Purpose                                                                   |
| ------------- | ------------- | ------------------------------------------------------------------------- |
| `validate`    | function      | Validate one HTML string. Runs all per-file rules plus cross-file over `[doc]`. |
| `validateMany`| function      | Validate many HTML strings together. Cross-file rules see all docs.        |
| `rules`       | readonly array| The canonical rule registry (per D-001 of the plan).                       |
| `Finding`     | type          | One violation. Fields: file, line, column, rule, severity, message, fixHint?, relatedLocations?. |
| `Rule`        | type          | Union of `PerFileRule | CrossFileRule`.                                    |
| `PerFileRule` | type          | Inspects one document.                                                     |
| `CrossFileRule` | type        | Inspects the whole set.                                                    |
| `Severity`    | type          | `"error" | "warning"`.                                                     |
| `Location`    | type          | `{ file, line, column }`.                                                  |
| `ValidateOptions` | type      | `{ file? }`.                                                               |
| `ParsedDocument`  | type      | `{ html, file, ast, status? }`.                                            |

## Rules in v0.1

| Rule                       | Default | Scope        | Flags                                                                |
| -------------------------- | ------- | ------------ | -------------------------------------------------------------------- |
| `no-missing-defer-to`      | error   | per-file     | `<spec-out-of-scope> <li>` missing `defer-to=`                       |
| `no-unresolved-question`   | error\* | per-file     | `<spec-question>` admonition (status-dependent)                       |
| `delta-op-required`        | error   | per-file     | `<spec-delta>` missing or invalid `op=`                              |
| `delta-target-required`    | error   | per-file     | `<spec-delta>` missing `target=`                                     |
| `risk-target-required`     | error   | per-file     | `<spec-risk>` missing `target=`                                      |
| `risk-status-required`     | error   | per-file     | `<spec-risk>` missing or invalid `status=`                           |
| `requirement-id-required`  | error   | per-file     | `<spec-requirement>` missing or malformed `id=`                       |
| `task-id-required`         | error   | per-file     | `<spec-task>` missing or malformed `id=`                              |
| `invest-row-failed`        | error\* | per-file     | `<dl class="invest">` with failing row (status-dependent)             |
| `no-duplicate-ids`         | error   | cross-file   | Project-wide stable IDs (`REQ-...-NNN`) repeated across files         |
| `empty-document`           | error   | per-file     | Empty or body-empty document                                          |
| `file-too-large`           | warning | per-file     | File exceeds 5,000 lines (NFR-001 boundary)                          |

\* Severity downgrades for `draft`/`review` status and skips for unset status.

## Provenance

Implements spec 002-validate-cli. See `specs/002-validate-cli/spec.html` in the
repo for the contract; `design.html` for the decisions (parse5, in-house SARIF,
TS-module schema); `tasks.html` for the breakdown.
