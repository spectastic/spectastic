# @spectastic/cli

[![npm](https://img.shields.io/npm/v/%40spectastic%2Fcli?label=npm&style=flat-square&labelColor=353534&color=5f023e)](https://www.npmjs.com/package/@spectastic/cli)
[![downloads](https://img.shields.io/npm/dm/%40spectastic%2Fcli?label=downloads%2Fmo&style=flat-square&labelColor=353534&color=5f023e)](https://www.npmjs.com/package/@spectastic/cli)
[![node](https://img.shields.io/badge/node-%3E%3D20-04a5bb?style=flat-square&labelColor=353534)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/%40spectastic%2Fcli?style=flat-square&labelColor=353534&color=7558b2)](https://github.com/spectastic/spectastic/blob/main/LICENSE)

Twenty-five commands on one binary. `spectastic init` bootstraps a spec-driven project, the lifecycle
verbs author and change its artifacts, and `spectastic validate` checks them against the canonical
grammar. Every artifact is a single self-contained HTML file that opens in any browser.

## Install

```sh
npm i -g @spectastic/cli
```

Node 20+. Pre-1.0, `latest` tracks the newest prerelease; `@next` resolves to the same build.

## `spectastic init`

Bootstrap a spec-driven project in the current directory:

```sh
cd my-project
spectastic init
```

Writes the lifecycle scaffold — 24 files by default:

- `.claude/commands/spectastic.*.md` — the 8 core slash commands (principles, spec, design, tasks, implement, propose, apply, triage); `--with explain|explore` adds an extended verb
- `assets/spec.{css,js}` — the design system
- `templates/{principles,spec,design,tasks,proposal,inbox}.html` — the artifact scaffolds

Conflict UX via [@clack/prompts](https://github.com/natemoo-re/clack): per-file `[y/N/a/s]` with `a`-all-overwrite and `s`-all-skip shortcuts. `--force` bypasses prompts; non-TTY context with conflicts refuses with exit 2.

## `spectastic validate`

Check spec-html artifacts:

```sh
spectastic validate "specs/**/*.html"                  # human output
spectastic validate "specs/**/*.html" --format json    # JSON for tooling
spectastic validate "specs/**/*.html" --format sarif   # SARIF for GH Code Scanning / GitLab
```

Exit `0` on clean, `1` on findings, `2` on usage errors. The rule set covers artifact shape (a missing
`defer-to=`, an unresolved `<spec-question>` in an accepted spec, malformed `<spec-delta>` / `<spec-risk>`
attributes, duplicate cross-file stable ids, failing INVEST rows), corpus citation integrity, and
executable content in an artifact.

## `spectastic change-risk`

Scan a diff for capability/scope red flags — a binary blob, a build-script/CI edit, an install hook, a high-entropy payload, a new dependency — and report a score:

```sh
spectastic change-risk                          # the default: uncommitted diff (working tree + staged)
spectastic change-risk --range main..HEAD        # an explicit commit range (the CI shape)
```

Prints each finding (category, weight, file, evidence), a 0–100 composite score, and a green/amber/red band. **Advisory by default** — it surfaces risk to force a human look and always exits `0`; it never claims to detect or certify the absence of malice. An opt-in `changeRisk.failAt` threshold in `spectastic.json` turns it into a gate:

```json
{
  "changeRisk": {
    "failAt": 60,
    "bands": { "amber": 25, "red": 60 }
  }
}
```

With `failAt` set, the command exits non-zero once the resolved score meets or exceeds it — otherwise every field is optional and the shipped band defaults apply.

## Provenance

Each published version on npmjs.com carries a verified-source attestation linking to the originating commit and GitHub Actions run. Verify with `npm audit signatures`.

## The rest of the surface

`spectastic --help` lists everything. Beyond `init` / `validate` / `change-risk` above, the binary carries
the headless lifecycle verbs (`spec`, `design`, `tasks`, `implement`, `propose`, `apply`, `triage`,
`principles`, `explore`, `run`) and the deterministic tools that make no model call (`enforce`, `verify`,
`order`, `gitignore`, `contract`, `units`, `owner`, `id`, `tests:for`, `verify:exec`, `course`, `corpus`).

## See also

- Project and full documentation: [github.com/spectastic/spectastic](https://github.com/spectastic/spectastic)
- Validation engine and rule registry: [@spectastic/schema](https://www.npmjs.com/package/@spectastic/schema)
- Corpus subsystem, standalone: [@spectastic/corpus](https://www.npmjs.com/package/@spectastic/corpus)
