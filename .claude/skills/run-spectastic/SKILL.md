---
name: run-spectastic
description: Build, run, and smoke-test the spectastic CLI. Use when asked to run spectastic, build the CLI, validate a spec-html file, scaffold a project with init, test an AI verb via the stub provider, or confirm a CLI change works end-to-end.
---

# Run spectastic

`spectastic` is single-file-HTML spec tooling. The primary deployable is the
**CLI** (`@spectastic/cli`, binary `spectastic`) — `init` scaffolds a project,
`validate` lints `spec-html` artifacts (human / JSON / SARIF), and the
AI-coupled verbs (`spec`, `plan`, `principles`, `tasks`, `propose`, `triage`,
`implement`) drive the lifecycle. It's a CLI, not a GUI: you drive it by
invoking the real binary and asserting exit codes + output.

The agent path is the **smoke driver** at
[.claude/skills/run-spectastic/driver.mjs](driver.mjs) — it exercises the
deterministic verbs and one AI verb (through the built-in stub) in throwaway
temp dirs and reports a pass/fail line per check.

**All paths below are relative to the repo root** (`packages/…`,
`.claude/skills/…`). This is a pnpm workspace; there is one CLI, so the skill
lives at the repo root.

## Prerequisites

- **Node ≥ 20** (verified on v25) and **pnpm 9.15** (`corepack enable` provides it).
- No system packages needed — pure TypeScript/Node.

## Build

```bash
pnpm install --frozen-lockfile
pnpm build
```

`pnpm build` runs `pnpm -r build` — tsup bundles `@spectastic/schema`,
`@spectastic/core`, and `@spectastic/cli` into each package's `dist/`. The CLI
bin (`packages/cli/bin/spectastic`) just imports `../dist/index.js`, so it needs
a build before it runs.

## Run (agent path) — the smoke driver

From the repo root:

```bash
node .claude/skills/run-spectastic/driver.mjs
```

Add `--build` to `pnpm build` first (do this after any source change):

```bash
node .claude/skills/run-spectastic/driver.mjs --build
```

Expected output — 9 checks, exit 0:

```
spectastic CLI smoke

  ✓ --version prints a version
  ✓ --help lists the verbs
  ✓ validate clean spec -> exit 0
  ✓ validate empty doc -> exit 1 + empty-document finding
  ✓ validate no-match -> exit 2
  ✓ validate --format json -> valid JSON array
  ✓ validate --format sarif -> SARIF 2.1.0
  ✓ init scaffolds a project (.claude/ + assets/)
  ✓ principles (AI stub) -> writes principles.html with P-N anchors

9 passed, 0 failed
```

## Run (direct invocation) — poke the binary yourself

The binary is `packages/cli/bin/spectastic` (run it with `node`). The
deterministic verbs need no AI provider:

```bash
node packages/cli/bin/spectastic --help
node packages/cli/bin/spectastic --version
```

`validate` is the workhorse. Exit code is the contract: **0** clean, **1**
findings, **2** usage error.

```bash
# clean, real spec in this repo -> "✓ no findings", exit 0
node packages/cli/bin/spectastic validate specs/000-spectastic/spec.html

# glob the whole corpus
node packages/cli/bin/spectastic validate 'specs/**/*.html'

# machine formats
node packages/cli/bin/spectastic validate specs/000-spectastic/spec.html --format json
node packages/cli/bin/spectastic validate specs/000-spectastic/spec.html --format sarif
```

`init` scaffolds into the **current directory** — always run it in a throwaway
dir, never the repo root:

```bash
cd "$(mktemp -d)" && node /Users/briancorbin/Code/spectastic/packages/cli/bin/spectastic init
```

### AI verbs without a real LLM (the stub provider)

The AI-coupled verbs (`spec`, `plan`, `principles`, `tasks`, `propose`,
`triage`) route through a stub `AIProvider` when `SPECTASTIC_AI_STUB` points at
a JSON fixture — no network, no key. Fixtures live in
`packages/cli/test/fixtures/*-script.json` (shape:
`{ chat?, ask?, subagent? }`, each array consumed sequentially). This is how CI
and the driver exercise these verbs:

```bash
cd "$(mktemp -d)"
CLI=/Users/briancorbin/Code/spectastic
node "$CLI/packages/cli/bin/spectastic" init
SPECTASTIC_AI_STUB="$CLI/packages/cli/test/fixtures/principles-script.json" \
  node "$CLI/packages/cli/bin/spectastic" principles
# -> "Wrote ./principles.html (5 principles)." with <h3 id="P-1..5">
```

Running an AI verb **without** the stub and without a configured Claude key will
try the real provider — expect it to prompt or fail. Use the stub for smoke.

## Test

```bash
pnpm test          # vitest, 67 files / 392 tests, ~15s
pnpm typecheck     # tsc --noEmit across schema, cli, vscode
pnpm test:e2e      # playwright (browser-level artifact behaviour)
```

`pnpm test:smoke` is the real-LLM tier — **local only, needs a Claude key**; it
is not part of the default smoke.

## The other deployable — the VSCode extension

`packages/vscode` (`spectastic-vscode`) is a read-only lifecycle-canvas webview.
It's a GUI that only runs inside VS Code's extension host (`F5` / Extension
Development Host), so it isn't part of this CLI driver. Its logic is covered by
`pnpm test` (`packages/vscode/src/host/*.test.ts`) and `pnpm test:e2e`.

## Gotchas

- **Exit codes get masked by pipes.** `spectastic validate … | head` reports
  `head`'s exit status, not the CLI's. To assert an exit code, redirect instead
  of piping (`… >/dev/null; echo $?`) or set `set -o pipefail`. The driver uses
  `execFileSync` so it reads the true code.
- **`validate` on a single file skips cross-file rules.** Rules like
  `no-broken-defer-to` need the corpus for their existence check — a lone
  negative fixture validates *clean*. To get a guaranteed finding standalone,
  use a near-empty document (fires `empty-document`) or a live
  `explorations/<id>/quarantine.json` marker (fires `explore-quarantined`, the
  anti-ship merge gate that runs on *every* validate regardless of path args).
- **`init` writes to CWD.** It scaffolds ~20 files (`.claude/`, `assets/`,
  `templates/`, …) into wherever you are. Run it in `$(mktemp -d)`.
- **The CLI bin needs a build.** `packages/cli/bin/spectastic` imports
  `../dist/index.js`; without `pnpm build` you get a module-not-found. The
  driver's `--build` flag handles this.
- **`.claude/commands/` are gitignored one-time copies** of `commands/*.md` and
  don't auto-sync — unrelated to running the CLI, but if a slash command seems
  stale, `cp commands/*.md .claude/commands/` (see repo `CLAUDE.md`).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Cannot find module '.../dist/index.js'` when running the bin | `pnpm build` (or run the driver with `--build`). |
| `validate` prints `No files matched the given patterns.` (exit 2) | The glob matched nothing — check the path, quote globs so the shell doesn't pre-expand them. |
| An AI verb hangs or asks for input | You ran it without `SPECTASTIC_AI_STUB` and without a Claude key. Point the env var at a fixture in `packages/cli/test/fixtures/`. |
| `pnpm` not found | `corepack enable` (Node ships corepack; it provisions pnpm 9.15 from `packageManager` in `package.json`). |
