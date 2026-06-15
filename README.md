# Spectastic

> Single-file HTML specs. The HTML-native alternative to markdown-based spec tooling.

Spectastic runs a structured spec lifecycle — `principles → spec → plan → tasks → implement → propose → apply → triage` — and emits a single self-contained `.html` file per artifact. The file uses a small vocabulary of semantic custom elements styled by a calm typographic system, so a spec reads like a quiet essay yet packs tables, diagrams, diffs, decision matrices, and progressive disclosure that markdown can't.

**See it first:** open [`index.html`](./index.html) in a browser for the landing page, then [`examples/spectastic-spec.html`](./examples/spectastic-spec.html) for a worked example — the spec for spectastic itself.

## Why

Spec-kit and friends produce dense markdown that reviewers find tiring. The format limits you to flat prose, fragile tables, and external diagram tools. Three patterns recur in the criticism:

- **Review fatigue.** Long undifferentiated prose; no progressive disclosure.
- **Markdown is thin.** No diagrams, no real tables, no inline annotation, no semantic anchors past headings.
- **"Waterfall in markdown."** Five gated phases duplicate background context across artifacts because cross-linking is weak.

HTML fixes those directly. The challenge is keeping the source as editable as markdown — for both humans and LLMs. That's what the component vocabulary is for.

## What it is

A directory you copy into your project:

```
spectastic/
├── index.html                    landing page (this design language, applied)
├── principles.html               project's five non-negotiable principles (v1.0.0)
├── plan.html                     implementation plan for spectastic itself
├── inbox.html                    project-root small-batch entry point (live)
├── assets/
│   ├── spec.css                  ~25 KB design system (calm cream palette, serif+sans+mono trio)
│   └── spec.js                   ~5 KB progressive enhancement
├── templates/
│   ├── principles.html           project principles scaffold
│   ├── spec.html                 feature specification scaffold
│   ├── plan.html                 implementation plan scaffold
│   ├── tasks.html                ordered task breakdown scaffold
│   ├── proposal.html             change-proposal scaffold
│   └── inbox.html                small-batch inbox scaffold
├── examples/
│   ├── spectastic-spec.html      worked example — the spec for spectastic itself
│   ├── triage-log.html           worked example — debug triage log
│   └── changes/archive/          archived change proposals against the worked spec
├── commands/
│   ├── spectastic.principles.md
│   ├── spectastic.spec.md
│   ├── spectastic.plan.md
│   ├── spectastic.tasks.md
│   ├── spectastic.implement.md
│   ├── spectastic.propose.md
│   ├── spectastic.apply.md
│   └── spectastic.triage.md
├── scripts/
│   └── inline.sh                 produce a fully standalone single-file artifact
└── README.md                     this file
```

## Lifecycle

Eight Claude Code slash commands. Five cover the core spec lifecycle, two cover ongoing change management, one runs alongside implementation to capture debug sessions.

| Phase | Command | Output |
| --- | --- | --- |
| 1. Establish principles     | `/spectastic.principles <project name>`   | `./principles.html` |
| 2. Spec a feature           | `/spectastic.spec <feature>`              | `specs/<id>/spec.html` |
| 3. Plan the build           | `/spectastic.plan [spec-id]`              | `specs/<id>/plan.html` |
| 4. Derive tasks             | `/spectastic.tasks [spec-id]`             | `specs/<id>/tasks.html` |
| 5. Implement a task         | `/spectastic.implement [T-NNN \| spec-id]`| code edits + ticked checkbox |
| 6. Propose a change         | `/spectastic.propose <change name>`       | `specs/<id>/changes/<date>-<slug>/proposal.html` |
| 7. Apply an approved change | `/spectastic.apply [<date>-<slug>]`       | live `spec.html` patched, change folder moved to `archive/` |
| 8. Triage a defect          | `/spectastic.triage <failure>`            | `specs/<id>/triage-log.html` (append) |

The slash command files live in `commands/`. Install them into your project's `.claude/commands/` (or run them from this directory directly) and Claude Code picks them up.

### Change proposals (`/spectastic.propose` + `/spectastic.apply`)

Spec evolution happens via PR-shaped proposal artifacts. Each change is a folder
(`specs/<id>/changes/<date>-<slug>/`) containing one `proposal.html` with intent, scope,
approach, deltas, and tasks. Deltas are typed via `<spec-delta op="added|modified|removed|renamed" target="REQ-…">` — a missing or wrong op renders the visible label `MISSING OP`, so silent failure is impossible by construction.

The format makes three load-bearing choices:

1. **One file per change.** A proposal is a single `proposal.html` carrying intent, scope, approach, deltas, and tasks together — not three or four separate documents the reviewer must mentally stitch.
2. **Typed `op` attribute** rather than hash-counted markdown headers. The four ops (`added`, `modified`, `removed`, `renamed`) are machine-readable; mis-typed ops fail loudly with a visible `MISSING OP` label.
3. **Inline rendered preview.** ADD and MODIFY deltas embed the post-state `<spec-requirement>` exactly as it'll appear when archived. Reviewers see what they're approving without running `git diff`.

See [`examples/changes/archive/2026-06-12-add-change-proposal/proposal.html`](./examples/changes/archive/2026-06-12-add-change-proposal/proposal.html) for a worked, archived proposal that exercised all four delta ops — applied verbatim against [`examples/spectastic-spec.html`](./examples/spectastic-spec.html).

#### Adversarial risk pass

[`REQ-CHANGE-004`](./examples/spectastic-spec.html#REQ-CHANGE-004) wires an adversarial risk pass into `/spectastic.propose` so first-draft proposals don't ship without critical pushback. The heuristic auto-fires when the proposal touches a `must`-tier requirement, contains an `op="removed"` delta, or spans two or more topic prefixes; flag overrides are `--adversarial` (force on) and `--no-adversarial` (force off). A spawned Agent identifies exactly three risks (regret-in-30-days, contradiction with the live spec, scope concern); each lands as a `<spec-risk>` block under a new §5 Risk register inside the proposal artifact, with `target=` citing a delta ID / REQ ID / `§n` anchor and `status` defaulting to `identified`. `/spectastic.apply` refuses if any risk is still `identified` — gating on the user-confirmed status field only; apply never re-runs the heuristic or re-spawns the critic.

The lineage is [ISO 31000](https://www.iso.org/iso-31000-risk-management.html)'s risk register: risks raised at design time become statused artifacts (`identified | accepted | mitigated | rejected`), not chat. The first worked example was the proposal that introduced REQ-CHANGE-004 itself — three findings opened, two mitigated via pre-apply revisions, one accepted — see [`examples/changes/archive/2026-06-13-adversarial-risk-pass/proposal.html`](./examples/changes/archive/2026-06-13-adversarial-risk-pass/proposal.html).

#### Rejection — both lifecycle surfaces

[`REQ-CHANGE-005`](./examples/spectastic-spec.html#REQ-CHANGE-005) codifies how the lifecycle records "considered, decided against." Rejection preserves history at both surfaces — nothing is deleted; the artifact stays discoverable.

- **Inbox cards (pre-propose)** — a `<spec-triage>` card may carry `data-status="rejected"` and a `<dt>Rejected because</dt>` row. The card stays in `inbox.html` with a REJECTED pill + muted body + struck title, mirroring the existing `data-status="done"` convention.
- **Authored proposals (post-propose)** — `/spectastic.apply --withdraw <YYYY-MM-DD>-<slug> --reason="<one-line>"` flips status to `withdrawn` and moves the folder to `examples/changes/withdrawn/<YYYY-MM-DD>-<slug>/` (parallel to `archive/`, not nested — applied and withdrawn are different terminal states). The live spec's `<spec-changelog>` records "Considered, withdrew" so future-you reaches the rejected idea via the spec, not by walking `changes/`. Withdraw is intended as terminal — there's no `--unwithdraw`; manual recovery via git revert is unsupported but not forbidden.

#### Post-apply routing — small vs. large

[`REQ-CHANGE-003`](./examples/spectastic-spec.html#REQ-CHANGE-003) names the rule for *where the follow-up implementation work lives* after `/spectastic.apply` lands a change:

- **Small change** (one or two requirements, behavioural addition, no new ADRs) → drive the inline task list inside the archived proposal. `/spectastic.implement` can target those tasks directly.
- **Large change** (multi-requirement, architectural shift, new topic group) → re-run `/spectastic.plan` then `/spectastic.tasks` against the updated spec to derive a fresh breakdown.

Boundary heuristic: *more than one new ADR would land → large.* The rule is guidance, not a guardrail — `/spectastic.apply` never auto-triggers plan/tasks and never refuses based on its own classification.

### Keeping specs small — INVEST + DORA small-batches

Specs grow because each "just one more edge case" is cheaper to add than to extract. The result is the *epic-disguised-as-a-spec* pattern (the canonical example: a UI spec that ends up wiring six libraries into one document, see [`docs/openspec-considerations.html`](./docs/openspec-considerations.html) for the project-internal observation).

Spectastic embeds the discipline that prevents this without adding new verbs:

- **`<spec-budget>`** in the header renders a live gauge. Default budgets: 1,500 words, 20 requirements, 12-minute read. Override with attributes (`<spec-budget words="2500" reqs="25" minutes="15">`). Amber from 70% of budget; red over. Specs that cross the threshold are signalled for splitting.
- **`<spec-out-of-scope>`** with required `defer-to=` makes excluded items into deferrals. Each entry points at a sibling spec ID, or `TBD` if the slice does not yet exist. Missing `defer-to` renders visibly broken.
- **INVEST self-check** in the header `<dl class="invest">` — six rows the author fills honestly. `V` and `T` carry linked evidence; failures (`<dd class="fail">`) block the plan.
- **Estimability gate** in `/spectastic.plan` — refuses to run while any `<spec-question>`, `[NEEDS CLARIFICATION]`, missing `defer-to=`, or failing INVEST row exists.
- **`<spec-parent specid="…">`** marks a spec as a child slice of a larger umbrella. The slice is still a regular spec.html; the parent reference is the only marker. The conformance index in the parent auto-aggregates child slices.
- **Budget-aware splitting nudge** in `/spectastic.propose` — proposals over ~5 deltas or crossing >2 topic prefixes get a "would these read better as two or three proposals?" prompt.

#### Retrofit recipe — splitting a bloated spec

When you already have a spec that's grown too large (e.g. a UI spec wiring multiple libraries), the existing verbs do the work:

1. **Identify slice boundaries.** Group the spec's requirements by surface, by user story, or by integration channel. Each group becomes a child slice.
2. **Scaffold each child** with `/spectastic.spec <slice-name>`. When asked for parent, name the umbrella spec ID — the child carries `<spec-parent specid="<umbrella>">` in the header.
3. **Copy** the relevant requirements from the umbrella into each child, preserving stable IDs. Reduce or remove the original surrounding prose; the child is shorter than its share of the umbrella.
4. **File a removal proposal** with `/spectastic.propose "extract <slice-name> from <umbrella>"`. The proposal contains one `<spec-delta op="removed" target="REQ-…">` per requirement now living in the child, with `reason="moved to <child-spec-id>"` and `migration="see <child-spec-id>#REQ-…"`.
5. **Apply** with `/spectastic.apply`. The umbrella shrinks; the children stand on their own; history sits in the umbrella's `changes/archive/`.

No `/spectastic.split` command needed — the workflow is `spec` + `propose` + `apply` composed.

### The small-batch loop — `inbox.html`

The structured lifecycle is overkill for "I have three small unrelated things in my head — a typo, a broken anchor, a tiny UI tweak." The small-batch loop closes that gap without adding verbs.

[`inbox.html`](./inbox.html) at project root holds `<spec-triage>` cards in four states:

| State | `layer=` | When |
| --- | --- | --- |
| Unrouted | (absent) | Just-captured items waiting for classification. |
| Just-do | `just-do` | Small enough that a spec wouldn't change the decision; one file, no contract change, revert-safe. |
| Defer | `defer` | Back-burner with `defer-to=` pointing at a sibling spec, `TBD-<topic>`, or `never`. |
| Routed | `spec` \| `plan` \| `implementation` \| `cross-spec` \| `principles` \| `platform` | Item became (or needs to become) a real spec change-proposal. |

The flow is three commands at most:

1. Paste your list to `/spectastic.triage "couple things — typo on principles.html line 42, broken anchor in CLAUDE.md, tighten budget gauge spacing"`. One card per item, classified inline, all appended to `inbox.html`.
2. `/spectastic.implement` with no argument drains the oldest `just-do` card from the inbox first, then falls back to the active spec's `tasks.html`. Pass `--all`, `--phase=<id>` (`setup` / `foundation` / `us1` / `us2` / `us3` / `polish`), or `--parallel` to drain in a single invocation instead of looping — per `REQ-TOOL-003`.
3. Loop step 2 until the inbox is drained or you switch back to feature work.

Cards stay in the inbox after completion (`data-status="done"`, strike-through + DONE pill) so the history is visible without cluttering the active list. This complements the formal lifecycle; it doesn't replace it.

### `/spectastic.triage` and the triage card

A single defect produces one `<spec-triage>` card appended to the spec's triage log. Five required fields — title, headline (Y-statement), Expected/Actual/Diagnosis, Layer + Regeneration result, Fix — fit on one screen and read in under 30 seconds. A collapsed `<details>` deep-dive is filled **only** if the bug touches a cross-spec contract, implicates a project-wide invariant, exposes deferred scope, or needs a hotfix-before-amendment sequence.

The format pairs with the `spectastic-debugger` skill — both routes produce the same schema. See [`examples/triage-log.html`](./examples/triage-log.html) for a worked log.

## Component vocabulary

Twelve-ish custom elements cover the spec shape. Tag name is schema.

| Element | Purpose |
| --- | --- |
| `<spec-meta>` | Header metadata — status, owner, version, dates. |
| `<spec-status>` | Inline pill — *draft / review / accepted / superseded / deprecated / blocked*. |
| `<spec-tldr>` | Boxed abstract, always near the top. |
| `<spec-audience-map>` | "Read this first" navigation. |
| `<spec-goals>` / `<spec-non-goals>` | Tickbox and crossbox lists. |
| `<spec-requirement>` | Unit of conformance. Stable id + `priority="must|should|may"`. |
| `<spec-rule>` | Inline RFC 2119 keyword — `MUST` / `SHOULD` / `MAY`. |
| `<spec-decision>` | ADR card (Context / Decision / Consequences). |
| `<spec-note>`, `<spec-warning>`, `<spec-question>`, `<spec-assumption>`, `<spec-tip>`, `<spec-example>` | Typed admonitions. |
| `<spec-tabs>` / `<spec-tab>` | Tab group (Source / Rendered / DOM, before / after). |
| `<spec-diff>` | Red/green change block using semantic `<ins>` and `<del>`. |
| `<spec-matrix>` | Option × criterion decision table with a `data-winner` row. |
| `<spec-tradeoff>` | Inline bar sparklines scoring options on a few axes. |
| `<spec-questions>` | Numbered open-question register. |
| `<spec-changelog>` | Append-only revision history. |
| `<spec-arch>` | Frame around an inline SVG architecture sketch. |
| `<spec-conformance>` | Auto-built index of every requirement. |
| `<spec-glossary>` | Definition list with cross-linked `<dfn>` references. |
| `<spec-sidenote>` | Margin note for asides that would interrupt the reading flow. |
| `<spec-newthought>` | Small-caps section opener. |
| `<spec-triage>` / `<spec-triage-log>` | Single-card debug triage with Y-statement headline, layer-coloured accent, regen-test pill, and conditional deep-dive. |
| `<spec-task id="T-NNN" parallel>` | Task entry in a `tasks.html` artifact. `id` is the stable `T-NNN`; boolean `parallel` renders the `[P]` pill via CSS; the inner `<input type="checkbox">` is the completion state, read by `:has(input:checked)` for the strike-through. Required per [`REQ-LIFECYCLE-003`](./examples/spectastic-spec.html#REQ-LIFECYCLE-003). |
| `<spec-change>` | Change-proposal wrapper. Holds intent / scope / approach / deltas / tasks. Status pill flows the proposal lifecycle (`proposed → under-review → approved → applied → withdrawn`). |
| `<spec-delta op="…" target="…">` | One change to one requirement. `op` is `added \| modified \| removed \| renamed`; `target` is the requirement ID. Missing/invalid `op` renders the visible label `MISSING OP`. ADD/MODIFY embed a post-state `<spec-requirement>` inline. |
| `<spec-risk-log>` | Container for the adversarial risk pass findings in a proposal. Lineage: [ISO 31000](https://www.iso.org/iso-31000-risk-management.html) risk register. |
| `<spec-risk target="…" status="…">` | One adversarial finding. `target=` cites a delta ID, requirement ID, or `§<n>` section anchor — missing renders the visible label `MISSING TARGET`. `status` is one of `identified \| accepted \| mitigated \| rejected` (or `no-value-found` when the critic agent self-reports nothing of value). `/spectastic.apply` refuses on any `identified`. |
| `<spec-budget>` | Live size gauge in the header: words / requirements / read-time vs configurable budgets. Green ≤70%, amber 70–100%, red over. Surfaces small-batches discipline at authoring time. |
| `<spec-out-of-scope>` | Deferral register. Every `<li>` requires a `defer-to=` attribute pointing to a sibling spec ID (or `TBD`). Missing `defer-to` renders the visible label `missing defer-to`. Converts scope-cutting from loss into deferral. |
| `<spec-parent specid="…">` | Optional header chip marking a spec as a slice of a larger parent. Renders as `Slice of <parent>`. The slice is still a regular spec — the parent reference is the only marker. |
| `<dl class="invest">` | Six-row INVEST self-check (Independent / Negotiable / Valuable / Estimable / Small / Testable). Each row `<dd>` defaults to ✓; mark a row with `class="fail"` to fail it. Used by the estimability gate. |

Everything degrades to readable static HTML if the JS never loads. The spec is still a spec.

## Design system

A calm typographic system that prioritises readability over chrome:

- **Background** warm cream `#f6f5f1`, never pure white.
- **Text** warm dark grey `#353534`, never pure black.
- **Links** crimson `#5f023e`, no underline, subtle bottom border.
- **Accents** sea-blue `#04a5bb`, purple `#7558b2`, salmon `#e1624f`, gold `#ffd09c` for `<mark>`.
- **Fonts** Fraunces (serif headings), Source Serif 4 (body), Lato (small-caps metadata), IBM Plex Mono (code).
- **Spacing** 8 px grid; fluid type scale from 14–82 px.
- **Layout** single column, ~38 rem reading measure, ~14 rem gutter for sidenotes.

A `html.dark` class flips to a warm dark theme without touching individual elements.

Open `assets/spec.css` to tweak. Everything is CSS custom properties at the top.

## Install

There are two CLIs in this repo today; both are intentional during the v0.1 transition.

### `spectastic init` (Python, project bootstrap)

A single-file Python 3.9+ script at `scripts/spectastic`. Runtime needs only the standard library — no `pip install` to run it. From a clone:

```sh
chmod +x scripts/spectastic
./scripts/spectastic init     # bootstrap the lifecycle into the current directory
```

### `spectastic validate` (Node, validator)

A Node package shipped as `@spectastic/cli` (see [`packages/cli/`](./packages/cli/) and the [spec at `specs/002-validate-cli/`](./specs/002-validate-cli/spec.html)). Validates spec-html files against the canonical grammar; emits human / JSON / SARIF.

```sh
# One-off via npx
npx @spectastic/cli validate "specs/**/*.html"

# Or install globally
npm i -g @spectastic/cli
spectastic validate --format sarif "specs/**/*.html" > spectastic.sarif
```

Two example CI workflows are under [`docs/ci-examples/`](./docs/ci-examples/): one for GitHub Actions (uploads SARIF to Code Scanning), one for GitLab CI (exposes SARIF as a SAST report). Both surface findings as inline PR/MR annotations.

#### Developing the Node packages

The Node side uses pnpm-compatible workspaces. pnpm is the canonical installer; [pacquet](https://github.com/pnpm/pacquet) (a Rust pnpm reimplementation) is permitted for faster local installs.

```sh
# install
corepack enable pnpm && pnpm install
# or, if corepack isn't available:
npm i -g pnpm && pnpm install

# typecheck + build + test
pnpm typecheck
pnpm -r build
pnpm test

# run the validator directly
node packages/cli/bin/spectastic validate principles.html
```

To put it on your `PATH` instead of running from a clone, copy the directory anywhere and symlink the executable:

```sh
git clone https://github.com/briancorbin/spectastic ~/.local/share/spectastic
chmod +x ~/.local/share/spectastic/scripts/spectastic
ln -s ~/.local/share/spectastic/scripts/spectastic ~/.local/bin/spectastic
```

### Usage

`spectastic init` runs in two passes: scan for conflicts, then write atomically. In an empty directory:

```text
$ cd my-new-project && spectastic init
spectastic init — summary
  wrote         16
  overwrote      0
  skipped        0

Next step:
  Open the project in Claude Code and run /spectastic.principles
  to author your project's principles.html.
```

When existing files conflict, you get a per-file `[y/N/a/s]` prompt (default = `N`, `a` = overwrite all remaining, `s` = skip all remaining). Pass `--force` to overwrite every conflict without prompting. In a non-TTY environment (CI, piped input) with conflicts, the CLI refuses with exit code 2 and a message naming `--force` rather than hanging on a prompt that can never be answered.

### Development

For development on the CLI itself (running the test suite at `scripts/test_spectastic.py`), the only dev-only dependency is `pytest`:

```sh
pip install pytest
pytest scripts/test_spectastic.py
```

`pytest` is not used at runtime; the CLI imports nothing third-party.

## Editing workflow

Source files in `templates/` and `specs/<id>/` link to `assets/spec.css` and `assets/spec.js` so you can iterate on the design system without touching every spec. When you want to ship one as a single attachable file:

```sh
scripts/inline.sh specs/001-auth/spec.html > dist/spec.html
```

The `inline.sh` script swaps the `<link>` and `<script>` tags for inline `<style>` and `<script>` blocks. Output is a single self-contained `.html` file under ~60 KB that runs from `file://`.

## Editing principles

These keep the source LLM-editable and diff-friendly:

1. **Source order is reading order.** Don't reorder content via JS.
2. **Semantic tags over class soup.** A concept gets a tag, not a `<div class="…">`.
3. **IDs are contracts.** `REQ-AUTH-001`, `D-001`, `T-110` — stable forever, used as anchors and for LLM-targeted edits.
4. **Progressive enhancement, never dependence.** JS adds polish; the spec works without it.
5. **Calm density.** Generous line-height, narrow measure, no chrome that doesn't carry meaning.

## Compared to

- **[GitHub spec-kit](https://github.com/github/spec-kit)** — a markdown-based spec-driven-development workflow with a similar lifecycle vocabulary. Spectastic's artifact is HTML; the design system, change-proposal workflow, and triage card are spectastic-specific.
- **[ReSpec](https://respec.org/docs/) / [Bikeshed](https://speced.github.io/bikeshed/)** — W3C spec tooling. Spectastic borrows the semantic-HTML shape, drops the W3C-specific conventions, and adds a friendlier visual language.
- **[Tufte CSS](https://edwardtufte.github.io/tufte-css/)** — the sidenote and small-caps section-opener patterns are common ancestry. Spectastic's palette is warmer and the component vocabulary is wider.
- **[ADRs](https://adr.github.io/)** — `<spec-decision>` is essentially an ADR component. Use spectastic as your ADR home if you don't already have one.

## Status

v0.1. Templates, design system, and four slash commands shipped. The spec for spectastic itself (`examples/spectastic-spec.html`) is the canonical reference for what a finished artifact looks like.

Open questions are tracked in §9 of [the spec](./examples/spectastic-spec.html#questions).
