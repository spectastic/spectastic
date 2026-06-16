# @spectastic/cli

Two subcommands on one binary: `spectastic init` bootstraps a spec-driven project; `spectastic validate` checks spec-html artifacts against the canonical grammar. Same lifecycle, same design system, same single-file artifacts that open in any browser.

## Install

```sh
npm i -g @spectastic/cli@next
```

(Replace `@next` with `@latest` once a bare-semver release ships.)

## `spectastic init`

Bootstrap a spec-driven project in the current directory:

```sh
cd my-project
spectastic init
```

Writes the canonical 16-file lifecycle:

- `.claude/commands/spectastic.*.md` — 8 slash commands (principles, spec, plan, tasks, implement, propose, apply, triage)
- `assets/spec.{css,js}` — the design system
- `templates/{principles,spec,plan,tasks,proposal,inbox}.html` — 6 scaffolds

Conflict UX via [@clack/prompts](https://github.com/natemoo-re/clack): per-file `[y/N/a/s]` with `a`-all-overwrite and `s`-all-skip shortcuts. `--force` bypasses prompts; non-TTY context with conflicts refuses with exit 2.

## `spectastic validate`

Check spec-html artifacts:

```sh
spectastic validate "specs/**/*.html"                  # human output
spectastic validate "specs/**/*.html" --format json    # JSON for tooling
spectastic validate "specs/**/*.html" --format sarif   # SARIF for GH Code Scanning / GitLab
```

Exit `0` on clean, `1` on findings, `2` on usage errors. Twelve rules in v1: missing `defer-to=`, unresolved `<spec-question>`, malformed `<spec-delta>` / `<spec-risk>` attributes, duplicate cross-file stable IDs, failing INVEST rows, and more.

## Provenance

Each published version on npmjs.com carries a verified-source attestation linking to the originating commit and GitHub Actions run. Verify with `npm audit signatures`.

## See also

- Project: [github.com/spectastic/spectastic](https://github.com/spectastic/spectastic)
- Validation engine and rule registry: [@spectastic/schema](https://www.npmjs.com/package/@spectastic/schema)
