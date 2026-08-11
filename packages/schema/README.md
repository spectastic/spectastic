# @spectastic/schema

[![npm](https://img.shields.io/npm/v/%40spectastic%2Fschema?label=npm&style=flat-square&labelColor=353534&color=5f023e)](https://www.npmjs.com/package/@spectastic/schema)
[![downloads](https://img.shields.io/npm/dm/%40spectastic%2Fschema?label=downloads%2Fmo&style=flat-square&labelColor=353534&color=5f023e)](https://www.npmjs.com/package/@spectastic/schema)
[![node](https://img.shields.io/badge/node-%3E%3D20-04a5bb?style=flat-square&labelColor=353534)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/%40spectastic%2Fschema?style=flat-square&labelColor=353534&color=7558b2)](https://github.com/spectastic/spectastic/blob/main/LICENSE)

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
| `rules`       | readonly array| The canonical rule registry.                                               |
| `Finding`     | type          | One violation. Fields: file, line, column, rule, severity, message, fixHint?, relatedLocations?. |
| `Rule`        | type          | Union of `PerFileRule | CrossFileRule`.                                    |
| `PerFileRule` | type          | Inspects one document.                                                     |
| `CrossFileRule` | type        | Inspects the whole set.                                                    |
| `Severity`    | type          | `"error" | "warning"`.                                                     |
| `Location`    | type          | `{ file, line, column }`.                                                  |
| `ValidateOptions` | type      | `{ file? }`.                                                               |
| `ParsedDocument`  | type      | `{ html, file, ast, status? }`.                                            |

## Rules

Thirty-four rules, grouped by what they protect. `rules` is the canonical registry — enumerate it rather
than trusting a list in a README to stay current.

**Artifact shape** — `requirement-id-required`, `task-id-required`, `task-title-bold-scope`,
`empty-document`, `date-format`, `id-within-file-unique`, `file-too-large`.

**Change proposals** — `delta-op-required`, `delta-target-required`, `data-delta-shape`,
`risk-target-required`, `risk-status-required`.

**Scope and sizing** — `no-missing-defer-to`, `no-broken-defer-to`, `invest-row-failed`,
`rice-well-formed`, `split-well-formed`, `format-band-coupling`, `matrix-winner-integrity`.

**Open questions** — `no-unresolved-question`, `no-placeholder-question`.

**Cross-file integrity** — `no-duplicate-ids`, `spec-id-unique`, `spec-parent-well-formed`,
`parent-child-reciprocity`, `verify-view-missing`, `verify-view-stale`.

**Contracts and objectives** — `contract-declaration-shape`, `contract-name-unique`,
`slo-target-required`, `slo-well-formed`.

**Grounding and security** — `corpus-citation-form`, `no-executable-content`,
`hidden-instruction-pattern`.

Severity for the status-dependent rules downgrades on a `draft` or `review` artifact and skips where
status is unset — an unfinished document is not a broken one.

## Provenance

Implements spec 002-validate-cli. See `specs/002-validate-cli/spec.html` in the
repo for the contract; `design.html` for the decisions (parse5, in-house SARIF,
TS-module schema); `tasks.html` for the breakdown.
