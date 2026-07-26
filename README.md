# Spectastic

> Single-file HTML specs. The HTML-native alternative to markdown-based spec tooling.

Spectastic runs a structured spec lifecycle — `principles → spec → plan → tasks → implement → propose → apply → triage` — and emits a single self-contained `.html` file per artifact. The file uses a small vocabulary of semantic custom elements styled by a calm typographic system, so a spec reads like a quiet essay yet packs tables, diagrams, diffs, decision matrices, and progressive disclosure that markdown can't.

**See it first:** open [`index.html`](./index.html) in a browser for the landing page, then [`specs/000-spectastic/spec.html`](./specs/000-spectastic/spec.html) for a worked example — the spec for spectastic itself.

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
│   ├── spec.js                   ~5 KB progressive enhancement
│   ├── theme-boot.js             render-blocking theme/mode boot (applies before first paint)
│   └── favicon.svg               the spectrum brand mark (see Brand logo)
├── templates/
│   ├── principles.html           project principles scaffold
│   ├── spec.html                 feature specification scaffold
│   ├── plan.html                 implementation plan scaffold
│   ├── tasks.html                ordered task breakdown scaffold
│   ├── proposal.html             change-proposal scaffold
│   └── inbox.html                small-batch inbox scaffold
├── specs/
│   └── 000-spectastic/           spectastic's own spec, dogfooded — spec · tasks · triage-log · changes/
├── examples/
│   ├── triage-log.html           worked example — debug triage log
│   └── slicing-gaps.html         worked example — spec-splitting walkthrough
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

### Core vs. extended verbs

The eight above are the **core** (hero) verbs — the minimal lifecycle surface, installed by default. Beyond them sits an **extended**, opt-in tier for capabilities that aren't part of the day-to-day flow. The tiers are declared in [`commands.json`](./commands.json); `spectastic init` installs only the core set unless you ask for an extended verb by name:

```sh
spectastic init --with explain      # also install the extended `explain` verb
```

| Extended verb | Command | What it does |
| --- | --- | --- |
| explain | `/spectastic.explain <target> [--proficiency=wheels\|completion\|independent]` | A grounded, in-chat coaching read of a spec, requirement, decision, or file. Ephemeral — writes no artifact, cites only real source, pulled on demand. |
| explain --course | `/spectastic.explain --course <target> [--keep]` | Generates a persistent, grounded **course** — a handful of objectives, each a reading + a quiz, on a mastery ledger. Every reference is verified to exist and every quiz item is checked to be unanswerable without the source. Courses are ephemeral: written under `.spectastic/courses/`, git-ignored by default (`--keep` retains). Backed by the `spectastic course` engine. |
| explore | `/spectastic.explore <intent>` | **Vibe to learn, spec to keep.** Scaffolds a *quarantined* exploration under `explorations/<id>/` — a git-ignored `explore.html` ledger plus a tracked `quarantine.json` marker — that you build loosely (SDD ceremony off, a thin P-1+P-2 floor on). The marker is the anti-ship gate: **`spectastic validate` errors while any exploration is quarantined**, so an un-graduated build can never merge (your branch is red by design until you *graduate* or *delete* it). |
| explore --graduate | `/spectastic.explore --graduate <id>` | **The back half of the loop.** Turns a quarantined exploration into a real, verified-grounded **spec + plan**, then lifts the quarantine and archives the exploration. Three steps: *classify* (spike → rebuild clean, or tracer-bullet → harden in place; recorded immutably), *extract* (read the build into a Draft spec + plan, the run record's proven facts seeded as `verified` rows in the **plan's** evidence ledger), and *lift + archive* (all-or-nothing: a failure leaves the build quarantined, no partial spec). Restore tasks for the graduated build are the sibling slice — see `tasks --restore`. |
| tasks --restore | `spectastic tasks <id> --restore` | **The other back half of graduation.** Generates path-appropriate restore tasks for a graduated exploration, reading the frozen classification from the archived marker: *refactor-to-comply* for a tracer-bullet (keep the build, harden it in place) or *clean-rebuild* for a spike (prototype marked for deletion). Output is banner-labelled. The trigger is always explicit — a flag, or an announced prompt on a TTY, and a refuse when piped — so it never emits the wrong task shape silently. |

### The guarantee layer — `init --tools`

Command markdown is advisory; a mandatory step written into it is a step an LLM can skip ([P-8](./principles.html#P-8)). `spectastic init --tools` moves the guarantees to where they can't be skipped — the git boundary:

```sh
spectastic init --tools            # install both halves (the default)
spectastic init --tools --hooks-only      # just the pre-commit gate
spectastic init --tools --commands-only   # just the drift-proof adapters
spectastic init --tools --uninstall       # remove what it installed (reversible)
```

- **Pre-commit gate.** Installs a git `pre-commit` hook that runs `spectastic validate` over the corpus and **rejects the commit** on any error — including an open `<spec-question>` in an *Accepted* spec (a Draft's open questions never block). It chains and preserves any existing hook, honours `core.hooksPath`, and adds well under a second to a commit. `git commit --no-verify` is the only, deliberate bypass. In a non-git project the gate is skipped with a warning and the adapter half still installs.
- **Drift-proof adapters.** Generates `.claude/commands/spectastic.*.md` from the `commands/*.md` source and a `commands-drift` check that makes the gate reject a commit while an installed adapter has drifted from source — closing the manual `cp` re-sync footgun for good. Deterministic and keyless.

### Profiles — `init --profile`

A project's ambition is a dial, not a default. `spectastic init --profile <name>` seeds a profile-shaped `principles.html` plus a lean, command-first `AGENTS.md` (the canonical, cross-tool agent manual) and a thin `CLAUDE.md` that points at it — deterministically, no model call:

```sh
spectastic init --profile lean         # low ceremony: formatter + a smoke check
spectastic init --profile standard      # lint + types + tests accompany behavior
spectastic init --profile verified      # every level tested; build a checker when none exists
spectastic init --profile enterprise    # + feature toggles, supply-chain, grounded decisions
spectastic init                          # in a terminal, prompts you to choose
```

Each profile is a preset composition of axes (verification rigor, enforcement posture, feature-toggle policy, grounding depth, framework expectations), declared as data in [`spectastic-profiles.json`](./spectastic-profiles.json). It's brownfield-safe: re-running amends in place through the same conflict prompt and never blind-overwrites, and re-running with a higher profile (say `lean` → `verified`) adds the new principles **additively** — your edits survive. The [`AGENTS.md` standard](https://agents.md) stays lean and points at your gates.

### The enforcement floor — `spectastic enforce`

A profile's rigor is only real if a gate can fail on it ([P-8](./principles.html#P-8)). `spectastic enforce` reads the project's profile marker, detects which enforcement categories your toolchain actually covers (formatter · linter · type-checker · security · supply-chain · test-runner, across Python/JS/Java/Go/Rust/Swift/C++), and exits non-zero when a hard-gate profile has a gap:

```sh
spectastic enforce            # Verified/Enterprise with a gap → exit 1, names the missing category
                              # Standard → warns but exits 0; Lean / no profile → no-op
```

It's deterministic and filesystem-only, so it drops straight into CI or a pre-commit hook (`spectastic enforce || exit 1`). Detection reports *gaps* — it never dictates a tool you already chose, and a brownfield `init --profile` tailors the generated `AGENTS.md` enforcement section to only what's missing (`--replace-tools` to override). This is [spec 042](./specs/042-profile-enforcement/spec.html), the enforcement half of profiles.

### Ignore files — `init` + `spectastic gitignore`

A bootstrapped project shouldn't commit build output or tool noise. `init` writes a base `.gitignore` covering spectastic's own ephemera (generated courses; *not* the tracked profile marker), and — once the stack is known at plan time — `spectastic gitignore --stack` appends the ecosystem's build-artifact ignores:

```sh
spectastic init                 # writes the base .gitignore block
spectastic gitignore --stack    # detects the stack, adds node_modules/, __pycache__/, target/, …
spectastic init --no-gitignore  # opt out
```

Every spectastic entry lives inside a marked block, so a brownfield `.gitignore` is **appended to, never clobbered** — your own rules outside the block are untouched, and re-runs are idempotent. This is [spec 043](./specs/043-init-project-config/spec.html), mirroring the same init-writes-base / plan-resolves-stack split as profiles→enforcement.

### Knowledge corpus — `spectastic init`

A spec is only as good as what the model already knows, and a domain fact can only ever cite what's actually
in the repo. `spectastic init` scaffolds a `knowledge/` directory — a committed, greppable corpus for the
domain knowledge a project's specs need to ground against, shaped as an [Agent Skills](https://agentskills.io/home)
folder (`SKILL.md` + `references/`) so it's portable across any skills-compatible agent, not tied to the one
that authored it:

```sh
spectastic init                              # scaffolds knowledge/<pack>/ alongside the usual templates
spectastic validate                          # a dangling KB-NNN citation or missing provenance field errors
```

Every document under `references/` carries a stable `KB-NNN` id — independent of file path, cited from a plan
decision as `KB-NNN@edition` — plus provenance frontmatter (`origin`, `origin-url`, `edition`, `license`,
`converter`, `content-hash`, `status`). A curated `index.md` gives an agent a cheap map before it reads
anything; no vector database, no retrieval index — agentic search over committed files, matching the way the
tool itself is already read.

**Cite an id *at an edition*.** A plan decision grounds a domain fact by citing `KB-NNN@edition` — the id
pinned to the exact edition it was read against — so a later re-ingest at a newer edition can never silently
change what a historical decision claimed. A prior edition is retained under `references/superseded/` (never
overwritten), so an edition-pinned citation always resolves; `spectastic validate` warns on a bare, unpinned
citation. This is [spec 052](./specs/052-corpus-citation-contract/spec.html); it also widens the plan verb's
grounding discipline so a domain fact can finally be `verified` against a corpus document instead of only
`assumed`.

**A citation can't rot into a dead reference, and a stale one can't hide.** `spectastic validate` resolves
every cited `KB-NNN@edition` against the committed corpus: a citation with no committed document at that id or
edition (including a fabricated or typo'd one) is a **`corpus-provenance` error**, failing the build — the same
fail-closed footing as an internal broken id. A citation pinned to a **superseded** edition is a
**`corpus-staleness` warning** — loud, like an `assumed` decision, but never blocking, since the world may have
moved with no one having re-ingested yet. Both gates are tier-independent (they fire the same way at every
profile); this is [spec 053](./specs/053-corpus-grounding-gates/spec.html). Two ceilings are recorded rather
than hidden: staleness can only notice a supersession once someone re-ingests the newer edition, never the
moment the world actually changes; and detecting whether the model grounds a claim *at all* is undecidable, so
that stays advisory, never a gate.

**Presence is guaranteed; use is only directable.** A corpus the harness merely told a verb's markdown to
"look for" is exactly the soft nudge that lets a model fabricate a citation instead of admitting there's
nothing to cite. So when a corpus exists, core **injects** its index and a fixed grounding directive into
every AI-verb prompt — `plan`, `spec`, `propose`, `tasks`, and `explore --graduate` — deterministically,
through the same fence-and-join mechanism that already places the principles in front of the model. That's
the guarantee: the corpus is *placed* in context, not merely pointed at. Grounding *use* stays honestly
advisory — a prompt can't force a citation, and no build gate infers a *missed* one (that's undecidable and
would false-fail a legitimately local decision); it's [spec 053](./specs/053-corpus-grounding-gates/spec.html)
above that checks a citation actually written. With no corpus, nothing is injected beyond a single discreet
one-time hint pointing at `spectastic init`'s scaffold — every verb otherwise runs byte-identical to before.
This is [spec 054](./specs/054-corpus-in-prompt/spec.html).

**Grounding isn't only an authoring concern.** The adversarial critic that reviews a change proposal, the
`explain` coaching read, and the harness's own review skills (`code-review`, `security-review`) can all use the
same corpus a spec is authored against. When a corpus exists, the critic gains a fourth angle — flagging a
requirement that contradicts a cited domain fact — alongside its usual three; `explain` cites the source a claim
rests on; and the generated `AGENTS.md` carries a standing hint pointing any review skill at the corpus. The
honest line holds here too: only the corpus's *presence* in the critic's input is a tested guarantee — whether
the critic (or a review skill spectastic doesn't own) actually acts on it stays advisory. This is
[spec 055](./specs/055-corpus-in-review/spec.html).

**The corpus is strictly optional.** With no `knowledge/` directory present, every verb behaves exactly as
today — spectastic works identically with or without one. This is [spec 051](./specs/051-knowledge-corpus/spec.html),
the first slice of a family that widens grounding to accept a corpus citation, checks it for referential
integrity, and feeds it to the authoring and review surfaces.

**Already have a knowledge base? Adapt it — never fabricate what it doesn't tell you.** Most teams hold
specialist knowledge in *some* shape already — a folder of markdown, an `llms.txt` index — and hand-authoring
provenance for every file is exactly the friction that keeps a good corpus out of the convention. First-class
treatment (citable, edition-pinned, gated) is a property of the *convention*, not of any particular pile of
files, so the honest answer to "I already have one" is a tier:

```sh
spectastic corpus adapt <folder>              # every .md gets frontmatter + a curated index
spectastic corpus adapt <folder>/llms.txt     # the llms.txt entries seed the index instead
```

The adapter derives what it can — a `sha256:` hash of every document's real bytes, always — and marks
everything it can't as an explicit `TODO`: an unknown `license`, `origin`, or `edition` is **never** guessed,
because a citation makes a wrong fact *more* credible, not less. It's safe to run repeatedly: an
already-adapted file is left completely untouched, ids never collide, and a field you've hand-corrected
survives every later re-run. The adapter owns no PDF converter — that stays your step, documented but never a
dependency: [Docling](https://github.com/docling-project/docling) is the structurally-rich default (best on
tables and formulas), [MarkItDown](https://github.com/microsoft/markitdown) is the fast path for clean digital
PDFs, and [Marker](https://github.com/VikParuchuri/marker) is the highest-fidelity option where a GPU budget
justifies it. This is [spec 056](./specs/056-corpus-adapter/spec.html) — the *adapt* rung of the adopt / adapt /
bridge-via-MCP tiering the [knowledge-base considerations](./docs/knowledge-base-considerations.html) doc lays out.

**A domain pack is a publishable unit — keep it spectastic-agnostic.** A pack meant for distribution (a
`finance-settlement` skill, say) must carry **zero** spectastic-specific instructions — no `<spec-decision>`
markup, no "cite this in a grounding" text — so it stays a clean [Agent Skill](https://agentskills.io/home)
equally useful in a plain agent project and in a spectastic repo. Any pack a `marketplace.json` declares
distributable is checked automatically:

```sh
spectastic validate .   # flags a spectastic-vocabulary leak, or a SKILL.md with no real discovery description
```

The check inspects only marketplace-listed packs — spectastic's own dogfood and scaffold corpora are never
touched, since they legitimately talk about spectastic itself. Portability across a *third-party* pack the tool
never sees stays a discipline it encourages, not a property it enforces — that ceiling is recorded, not hidden.
Discoverability matters as much as portability: an agent's Agent Skills router reads a pack's `SKILL.md`
`description` before anything else (progressive disclosure), so the check also flags a missing or placeholder
one. See [`examples/knowledge/finance-settlement/`](./examples/knowledge/finance-settlement/) for a worked
example — a clean pack with a description written to trigger across development, learning, and knowledge-share
tasks — paired with the citation binding that stays in the *harness*, never the pack (spec 052 FR-004). This is
[spec 057](./specs/057-portable-domain-skill/spec.html).

**Committing a document makes its redistribution terms unavoidable.** The moment a third-party document lands
in-repo — a vendored standard, a paywalled regulatory text, a licensed reference manual — its license applies to
the repo, whether or not anyone reads it first. Every corpus document declares a `license` in its provenance
frontmatter (a missing one is already a `corpus-well-formed` error, spec 051); `spectastic validate` additionally
flags a **declared** license that restricts redistribution:

```sh
spectastic validate .   # a corpus-license warning names a restrictive/unrecognised declared license
```

The rule is conservative by construction: a **permissive allowlist** (MIT, Apache-2.0, BSD-2/3-Clause, CC0-1.0,
plain CC-BY, ISC, Unlicense, 0BSD, public-domain) goes silent; a known-restrictive license, an id the allowlist
doesn't carry, or a placeholder such as the adapter's own `TODO` marker (spec 056) all produce a
`corpus-license` **warning** — never an error, since whether to commit restricted material is the project's call
to make with the fact in front of it. The rule flags a *declared* license only; it never adjudicates license
compatibility or legal effect — a recorded ceiling, not a claim the tool can't back.

**What may be committed, and the escape hatch for what can't.** Material the project holds rights to redistribute
— public-domain facts, permissively-licensed references, hand-authored illustrative excerpts — may be committed
in-repo, where it's citable, greppable, and durable. Material that carries a restrictive license and cannot be
redistributed has a sanctioned by-reference path instead: bridge it live via an MCP server, or keep only its
`origin-url` in the index and never commit the text itself. A restrictive license committed anyway is a decision
on the record (the `corpus-license` warning above), not a silent liability. A worked example: a hypothetical
`KB-002` document declaring an "All rights reserved, internal distribution only" license would warn on every
`validate` run rather than sit as a silent liability — illustrative only, never shipped into this repo's own
corpus. This is [spec 058](./specs/058-corpus-licensing/spec.html).

### Change proposals (`/spectastic.propose` + `/spectastic.apply`)

Spec evolution happens via PR-shaped proposal artifacts. Each change is a folder
(`specs/<id>/changes/<date>-<slug>/`) containing one `proposal.html` with intent, scope,
approach, deltas, and tasks. Deltas are typed via `<spec-delta op="added|modified|removed|renamed" target="REQ-…">` — a missing or wrong op renders the visible label `MISSING OP`, so silent failure is impossible by construction.

The format makes three load-bearing choices:

1. **One file per change.** A proposal is a single `proposal.html` carrying intent, scope, approach, deltas, and tasks together — not three or four separate documents the reviewer must mentally stitch.
2. **Typed `op` attribute** rather than hash-counted markdown headers. The four ops (`added`, `modified`, `removed`, `renamed`) are machine-readable; mis-typed ops fail loudly with a visible `MISSING OP` label.
3. **Inline rendered preview.** ADD and MODIFY deltas embed the post-state `<spec-requirement>` exactly as it'll appear when archived. Reviewers see what they're approving without running `git diff`.

See [`specs/000-spectastic/changes/archive/2026-06-12-add-change-proposal/proposal.html`](./specs/000-spectastic/changes/archive/2026-06-12-add-change-proposal/proposal.html) for a worked, archived proposal that exercised all four delta ops — applied verbatim against [`specs/000-spectastic/spec.html`](./specs/000-spectastic/spec.html).

#### Adversarial risk pass

[`REQ-CHANGE-004`](./specs/000-spectastic/spec.html#REQ-CHANGE-004) wires an adversarial risk pass into `/spectastic.propose` so first-draft proposals don't ship without critical pushback. The heuristic auto-fires when the proposal touches a `must`-tier requirement, contains an `op="removed"` delta, or spans two or more topic prefixes; flag overrides are `--adversarial` (force on) and `--no-adversarial` (force off). A spawned Agent identifies exactly three risks (regret-in-30-days, contradiction with the live spec, scope concern); each lands as a `<spec-risk>` block under a new §5 Risk register inside the proposal artifact, with `target=` citing a delta ID / REQ ID / `§n` anchor and `status` defaulting to `identified`. `/spectastic.apply` refuses if any risk is still `identified` — gating on the user-confirmed status field only; apply never re-runs the heuristic or re-spawns the critic.

The lineage is [ISO 31000](https://www.iso.org/iso-31000-risk-management.html)'s risk register: risks raised at design time become statused artifacts (`identified | accepted | mitigated | rejected`), not chat. The first worked example was the proposal that introduced REQ-CHANGE-004 itself — three findings opened, two mitigated via pre-apply revisions, one accepted — see [`specs/000-spectastic/changes/archive/2026-06-13-adversarial-risk-pass/proposal.html`](./specs/000-spectastic/changes/archive/2026-06-13-adversarial-risk-pass/proposal.html).

#### Rejection — both lifecycle surfaces

[`REQ-CHANGE-005`](./specs/000-spectastic/spec.html#REQ-CHANGE-005) codifies how the lifecycle records "considered, decided against." Rejection preserves history at both surfaces — nothing is deleted; the artifact stays discoverable.

- **Inbox cards (pre-propose)** — a `<spec-triage>` card may carry `data-status="rejected"` and a `<dt>Rejected because</dt>` row. The card stays in `inbox.html` with a REJECTED pill + muted body + struck title, mirroring the existing `data-status="done"` convention.
- **Authored proposals (post-propose)** — `/spectastic.apply --withdraw <YYYY-MM-DD>-<slug> --reason="<one-line>"` flips status to `withdrawn` and moves the folder to `specs/000-spectastic/changes/withdrawn/<YYYY-MM-DD>-<slug>/` (parallel to `archive/`, not nested — applied and withdrawn are different terminal states). The live spec's `<spec-changelog>` records "Considered, withdrew" so future-you reaches the rejected idea via the spec, not by walking `changes/`. Withdraw is intended as terminal — there's no `--unwithdraw`; manual recovery via git revert is unsupported but not forbidden.

#### Post-apply routing — small vs. large

[`REQ-CHANGE-003`](./specs/000-spectastic/spec.html#REQ-CHANGE-003) names the rule for *where the follow-up implementation work lives* after `/spectastic.apply` lands a change:

- **Small change** (one or two requirements, behavioural addition, no new ADRs) → drive the inline task list inside the archived proposal. `/spectastic.implement` can target those tasks directly.
- **Large change** (multi-requirement, architectural shift, new topic group) → re-run `/spectastic.plan` then `/spectastic.tasks` against the updated spec to derive a fresh breakdown.

Boundary heuristic: *more than one new ADR would land → large.* The rule is guidance, not a guardrail — `/spectastic.apply` never auto-triggers plan/tasks and never refuses based on its own classification.

### Keeping specs small — INVEST + DORA small-batches

Specs grow because each "just one more edge case" is cheaper to add than to extract. The result is the *epic-disguised-as-a-spec* pattern (the canonical example: a UI spec that ends up wiring six libraries into one document, see [`docs/openspec-considerations.html`](./docs/openspec-considerations.html) for the project-internal observation).

Spectastic embeds the discipline that prevents this without adding new verbs:

- **`<spec-budget>`** in the header renders a live gauge. Default budgets: 1,500 words, 20 requirements, 12-minute read. Override with attributes (`<spec-budget words="2500" reqs="25" minutes="15">`). Amber from 80% of budget; red over (the industry-standard "approaching limit" warn point). The Words row counts **authored** prose — the auto-built conformance index is excluded, since it's generated, not written. Specs that cross the threshold are signalled for splitting. **Spec-only** — the budget is the spec-sizing discipline, so it ships only in `spec.html`; plans, tasks, and principles show read-time in their `<spec-meta>` and carry no budget (a requirements gauge on a plan would always read 0).
- **`<spec-out-of-scope>`** with required `defer-to=` makes excluded items into deferrals. Each entry points at a sibling spec ID, or `TBD` if the slice does not yet exist. Missing `defer-to` renders visibly broken.
- **INVEST self-check** in the header `<dl class="invest">` — six rows the author fills honestly. `V` and `T` carry linked evidence; failures (`<dd class="fail">`) block the plan.
- **Estimability gate** in `/spectastic.plan` — refuses to run while any `<spec-question>`, `[NEEDS CLARIFICATION]`, missing `defer-to=`, or failing INVEST row exists.
- **Grounded planning** in `/spectastic.plan` (`REQ-LIFECYCLE-006`) — before the interview, the plan reads the real consuming code, dependency signatures at the resolved lockfile version, and platform constraints, and records each design-bearing fact in a §3 **Grounding & evidence** ledger as `verified` / `spike` / `assumed`. Every `<spec-decision>` carries `grounding="…"` and cites its source; an ungrounded one renders `UNGROUNDED`. The discipline is a `SHOULD`; the **gate** is the `MUST` — no hand-off to `/spectastic.tasks` while a `must`-tier decision rests on an unverified assumption the author hasn't accepted as a `<spec-risk>`. Moves discovery from implementation back to planning.
- **`<spec-parent specid="…">`** marks a spec as a child slice of a larger umbrella. The slice is still a regular spec.html; the parent reference is the only marker. The conformance index in the parent auto-aggregates child slices.
- **`verify.html`** is a *generated, derived* per-spec view answering "how do I run it, and how do I know it works?" (spec [`021-verify-view`](./specs/021-verify-view/spec.html)). It **aggregates** the bundle's success criteria → acceptance → closing test-task trace *by reference* (links, never copied prose) and adds the one authored thing — a medium-agnostic **Run/Demo block** of typed elements (`<spec-run>`, `<spec-toggle>`, `<spec-tests cites="…">`, `<spec-demo cites="…">`) that `/spectastic.implement` fills from the commands it *actually ran* on completion (an unrecorded field renders loudly, never blank). It carries no `<spec-status>` of its own (it derives the spec's), and `spectastic validate` flags it as stale when its links drift from the bundle. Regenerate (or rebuild the links while preserving the captured Run block) with `spectastic verify <spec-id>`.
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

### Git automation (opt-in, off by default)

The lifecycle already projects onto git — the verb is the commit type, the spec id is the scope, the slice is the branch. Spectastic can drive that projection for you, so each verb derives its own branch and commit from the artifact it just wrote. It is **off by default**: a developer running their own git flow is unaffected.

Enable it with a `spectastic.json` at your project root. An absent file or key means the defaults apply (off):

```json
{
  "git": {
    "auto": "off"
  }
}
```

`git.auto` is a tri-state:

- **`off`** (default) — no verb performs any git action. Your repository's git state is unchanged by running a verb.
- **`commit`** — after a verb writes its artifact, spectastic commits it on the **current** branch. No branch is created.
- **`branch+commit`** — additionally, when `spec` opens a new slice, spectastic creates and switches to the `NNN-slug` branch off the default branch before committing.

Auto-commit subjects follow Conventional Commits — `<verb>(NNN): <subject>`, verb as type and spec id as scope:

```
spec(026): git strategy — the opt-in git layer
```

Each verb accepts `--commit` / `--no-commit` to override the configured behaviour for a single invocation.

Each verb knows its own git shape — the type is the verb, the scope is the spec id, and only `spec` opens a branch:

| Verb | Branch | Commit subject |
| --- | --- | --- |
| `spec` (new slice) | creates `NNN-slug` | `spec(NNN): <title>` |
| `plan` / `tasks` / `propose` / `apply` | stays on the current branch | `<verb>(NNN): <subject>` |
| `implement` (spec task) | stays put | `implement(NNN): <summary>` — one commit per run |
| `triage` (list) / `principles` / `implement` (inbox card) | stays put | `<verb>: <subject>` — unscoped, no spec id |

Two guarantees hold regardless of the setting:

- **Small, revert-safe work stays put.** `just-do` cards, triage-list intake, and one-file hotfixes commit on the current branch — never a new branch — even under `branch+commit`, reusing the same boundary the small-batch loop already draws.
- **A failing artifact is never committed.** The commit runs only after a clean `spectastic validate`; on any finding there is no commit and the failure is surfaced loudly. Per-verb commits are the legible record — spectastic does not squash or rewrite history.

Setting `git.auto` is currently a hand edit; an installer that writes it for you is a separate, not-yet-shipped slice.

### Attribution trailers (`git.trailers`)

With `git.trailers = on` (default off; it only acts when `git.auto` commits), the layer derives commit-footer trailers from the artifact's `<spec-meta>` and the lifecycle:

```
spec(027): git trailers — attribution from the artifact

Author: Brian Corbin · @briancorbinxyz
Reviewed-by: Jane Reviewer · @jane
Acked-by: the human who dispositioned the risk pass
Assisted-by: claude-…
Refs: changes/archive/2026-…-slug
```

`Author`, `Reviewed-by`, `Co-authored-by` (when the artifact author isn't the committer), `Acked-by`, and `Refs` name **humans only** — a missing source is omitted, never faked. The assisting model is acknowledged distinctly as **`Assisted-by:`** — a tool acknowledgment, never authorship — and is the only trailer the AI ever appears on. `Assisted-by` is emitted on AI-coupled verb commits (`spec`/`plan`/`tasks`/`triage`/`principles`/`propose`); deterministic verbs (`apply`, an `implement` tick) carry none.

```json
{ "git": { "auto": "branch+commit", "trailers": "on" } }
```

### Stack-selection interview (`plan.stackInterview`)

At plan time, `/spectastic.plan` can offer a bounded, context-seeded choice for any undecided stack pick — language,
framework, test framework, coverage tool, persistence — instead of waiting for you to hand-fill §2 Technical context.
The recommendation is seeded from repo detection, standing docs (`CLAUDE.md`/`AGENTS.md`/a linked architecture doc),
and the profile's `frameworks` axis stance — never a maintained house catalog — and it self-skips anything already
fixed. This is [spec 050](./specs/050-stack-selection/spec.html).

It's **on by default**. Opt out with a `spectastic.json` at your project root:

```json
{
  "plan": {
    "stackInterview": false
  }
}
```

- **absent / `true`** (default) — the plan's decision phase offers each undecided material stack dimension as a
  bounded choice with a context-seeded recommendation.
- **`false`** — the pass does not run; §2 is authored by hand, exactly as before this feature shipped.

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
| `<spec-changelog>` | Append-only revision history. On a **versioned** artifact (e.g. principles), each entry records **version · date** — `<span class="rev"><b>vX.Y.Z</b> · <time>DATE</time></span>` in the meta cell, then the note — mirroring the reference design. Date-only on unversioned artifacts. |
| `<spec-arch>` | Frame around an inline SVG architecture sketch. |
| `<spec-conformance>` | Auto-built index of every requirement. |
| `<spec-glossary>` | Definition list with cross-linked `<dfn>` references. |
| `<spec-sidenote>` | Margin note for asides that would interrupt the reading flow. |
| `<spec-newthought>` | Small-caps section opener. |
| `<spec-triage>` / `<spec-triage-log>` | Single-card debug triage with Y-statement headline, layer-coloured accent, regen-test pill, and conditional deep-dive. |
| `<spec-task id="T-NNN" parallel>` | Task entry in a `tasks.html` artifact. `id` is the stable `T-NNN`; boolean `parallel` renders the `[P]` pill via CSS; the inner `<input type="checkbox">` is the completion state, read by `:has(input:checked)` for the strike-through. Required per [`REQ-LIFECYCLE-003`](./specs/000-spectastic/spec.html#REQ-LIFECYCLE-003). |
| `<spec-change>` | Change-proposal wrapper. Holds intent / scope / approach / deltas / tasks. Status pill flows the proposal lifecycle (`proposed → under-review → approved → applied → withdrawn`). |
| `<spec-delta op="…" target="…">` | One change to one requirement. `op` is `added \| modified \| removed \| renamed`; `target` is the requirement ID. Missing/invalid `op` renders the visible label `MISSING OP`. ADD/MODIFY embed a post-state `<spec-requirement>` inline. |
| `<spec-risk-log>` | Container for the adversarial risk pass findings in a proposal. Lineage: [ISO 31000](https://www.iso.org/iso-31000-risk-management.html) risk register. |
| `<spec-risk target="…" status="…">` | One adversarial finding. `target=` cites a delta ID, requirement ID, or `§<n>` section anchor — missing renders the visible label `MISSING TARGET`. `status` is one of `identified \| accepted \| mitigated \| rejected` (or `no-value-found` when the critic agent self-reports nothing of value). `/spectastic.apply` refuses on any `identified`. |
| `<spec-budget>` | Live size gauge in the header: words / requirements / read-time vs configurable budgets. Green ≤80%, amber 80–100%, red over; the Words row counts authored prose (excludes the conformance index). Surfaces small-batches discipline at authoring time. |
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

Two orthogonal axes drive the look: a **theme** (`data-theme` — `spectastic-calm` or
`spectastic-vivid`, owning typography weight + structure) and a **mode** (`data-mode` —
`light` or `dark`, owning colour). A footer dropdown picks the theme; the toggle flips the
mode; both persist in `localStorage` and apply before first paint. Adding a theme is one
`[data-theme="…"]` block in `assets/spec.css` plus one registry entry in
`assets/theme-boot.js` — no per-artifact edits.

Open `assets/spec.css` to tweak. Everything is CSS custom properties at the top.

### Brand logo

The mark is the **spectrum asterisk** — one prong path rotated eight times at 45°, its eight fills the
eight lifecycle commands in fixed clockwise order (principles `#5f023e` → spec → plan → tasks →
implement → propose → apply → triage `#7558b2`). It is always the canonical inline SVG (`var(--spec-1…8)`
fills, `favicon.svg` for tabs) — **never** a Unicode glyph; the order and colours never change. The
spectrum is the default; a mono variant follows the ink for single-colour use, and dark mode swaps in a
brightened set automatically.

Place it **after** the wordmark, lifted to the cap line — two techniques:

```html
<!-- A · wordmark lockup (chrome, headings) — mark 0.52em, cap-line aligned -->
<span class="spec-logo">spectastic<svg viewBox="0 0 100 100" aria-hidden="true" style="overflow:visible"><!-- 8 prongs, fill var(--spec-1…8) --></svg></span>

<!-- B · running text — the mark as a superscript -->
spec-driven<sup class="spec-sup"><svg viewBox="0 0 100 100" style="overflow:visible"><!-- 8 prongs --></svg></sup> done right
```

Keep one prong-length of clearspace around the standalone icon and don't render it below 16px. Full
contract: [`specs/017-brand-logo/spec.html`](./specs/017-brand-logo/spec.html).

## Install

One CLI, two subcommands. The Node package `@spectastic/cli` provides both `spectastic init` (bootstrap a project) and `spectastic validate` (check spec-html files against the canonical grammar; emits human / JSON / SARIF).

```sh
# One-off via npx
npx @spectastic/cli init
npx @spectastic/cli validate "specs/**/*.html"

# Or install globally
npm i -g @spectastic/cli
cd my-new-project
spectastic init
spectastic validate --format sarif "specs/**/*.html" > spectastic.sarif

# Regenerate a spec's derived verify.html (the SC → acceptance → test trace).
# /spectastic.implement also materialises it on completion, grounding the
# Run/Demo block in the commands it actually ran.
spectastic verify 021-verify-view

# Order the spec corpus by dependency-respecting value: print the ordered spec
# ids (for scripting / the future slicer) and write a self-contained roadmap.html.
# Edges are inferred from reciprocated defer-to ↔ <spec-parent> pairs; ties break
# by RICE value (authored in each spec's <spec-rice> block); a cycle errors loudly.
spectastic order --out roadmap.html

# Value-ranked slicer (spec 029): propose a split of an over-budget Draft spec.
# The `spec --split` mode appends a <spec-split> proposal — candidate children,
# RICE-ranked and R-002 dependency-ordered, with a coverage partition proving
# every requirement lands in exactly one child — and mints nothing. A cohesive
# spec gets an explicit "don't split" verdict. A past-Draft parent is refused
# in place and pointed at /spectastic.propose (P-6).
spectastic spec 012-editor-ui --split
```

Two example CI workflows are under [`docs/ci-examples/`](./docs/ci-examples/): one for GitHub Actions (uploads SARIF to Code Scanning), one for GitLab CI (exposes SARIF as a SAST report). Both surface findings as inline PR/MR annotations.

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

When existing files conflict, you get a per-file `[y/N/a/s]` prompt (default = `N`, `a` = overwrite all remaining, `s` = skip all remaining) via [@clack/prompts](https://github.com/natemoo-re/clack). Pass `--force` to overwrite every conflict without prompting. In a non-TTY environment (CI, piped input) with conflicts, the CLI refuses with exit code 2 and a message naming `--force` rather than hanging on a prompt that can never be answered.

### Development

The Node side uses pnpm-compatible workspaces. pnpm is the canonical installer; [pacquet](https://github.com/pnpm/pacquet) (a Rust pnpm reimplementation) is permitted for faster local installs.

```sh
# install (Node 20+ required)
corepack enable pnpm && pnpm install
# or, if corepack isn't available:
npm i -g pnpm && pnpm install

# typecheck + build + test
pnpm typecheck
pnpm -r build
pnpm test

# run from the clone
node packages/cli/bin/spectastic init
node packages/cli/bin/spectastic validate principles.html

# or symlink onto PATH
ln -s "$(pwd)/packages/cli/bin/spectastic" ~/.local/bin/spectastic
```

## Releasing

A release is a git tag push. The GitHub Actions workflow at [`.github/workflows/publish.yml`](.github/workflows/publish.yml) runs the gates (typecheck + tests + build + version verify) and publishes `@spectastic/cli`, `@spectastic/core` and `@spectastic/schema` to npm with provenance attestation via GitHub OIDC.

### Primary release path (CI-driven)

```sh
# 1. Bump the version in all three packages to the same value.
$EDITOR packages/cli/package.json     # e.g. "version": "0.1.0-pre.3"
$EDITOR packages/core/package.json    # must match cli exactly
$EDITOR packages/schema/package.json  # must match cli exactly

# 2. Commit and tag (the v prefix is required; matches the workflow trigger).
git commit -am "v0.1.0-pre.3"
git tag v0.1.0-pre.3
git push --follow-tags
```

The workflow:

- Runs typecheck + tests + build. **Refuses to publish if any gate fails.**
- Verifies the tag-derived version (`v0.1.0-pre.3` → `0.1.0-pre.3`) matches the `version` field in **all three** packages' `package.json`. Refuses on mismatch.
- Derives the dist-tag set via [`scripts/derive-dist-tag.mjs`](scripts/derive-dist-tag.mjs), keyed on whether a **stable release exists** — not on the version string. While no bare-semver version has ever been published, a pre-release moves **both** `next` and `latest`, so `npm i -g @spectastic/cli` resolves to the newest build instead of freezing on an old one. Once `1.0.0` ships the guard engages by itself: pre-releases go to `next` only, keeping a bare `npm i` off them. An undeterminable registry state fails the run rather than guessing a tag.
- Publishes all three packages in one `pnpm publish -r` invocation with `--provenance --access public`, then applies any additional dist-tag. The provenance attestation appears on each version's npmjs.com page as a verified-source badge linking to the commit and workflow run.

Watch the run in the [Actions tab](https://github.com/spectastic/spectastic/actions/workflows/publish.yml).

### Rolling back a bad release

Because `latest` tracks the newest pre-release until `1.0.0` ships, a bad release becomes the default install for everyone running `npm i -g @spectastic/cli`. Demote it by pointing `latest` back at the last known-good version — npm cannot cleanly unpublish, so re-tagging *is* the rollback:

```sh
npm login                       # a maintainer of @spectastic
LAST_GOOD=0.1.0-pre.17          # the version to fall back to

for PKG in @spectastic/cli @spectastic/core @spectastic/schema; do
  npm dist-tag add "$PKG@$LAST_GOOD" latest
done

# Confirm every package agrees before telling anyone it's fixed.
for PKG in @spectastic/cli @spectastic/core @spectastic/schema; do
  npm view "$PKG" dist-tags
done
```

Leave `next` pointing at the bad version so the failure stays reproducible, and cut a fixed release rather than reusing the burned version number — npm forbids republishing one. If the publish itself half-succeeded (published, but the dist-tag step failed), the workflow goes red; the same commands finish the job.

### Emergency local fallback

If CI is unavailable, a maintainer can publish from their laptop:

```sh
npm login                       # authenticate as a maintainer of @spectastic
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test
pnpm -r build                   # re-runs prebuild so _bundled/ is fresh
pnpm publish -r \
  --provenance \
  --access public \
  --tag next                    # or "latest" for a bare semver release

# Pre-1.0, also move `latest` so the bare install isn't left on an old build
# (this is what the workflow's derive step does for you — see above).
for PKG in @spectastic/cli @spectastic/core @spectastic/schema; do
  npm dist-tag add "$PKG@$(node -p "require('./packages/cli/package.json').version")" latest
done
```

The local fallback uses your laptop's npm token (in `~/.npmrc`), not the CI's `NPM_TOKEN` secret. `--provenance` from a local machine requires an npm trusted-publisher configuration; without it, the published version will not show a provenance badge until republished via CI.

### One-time bootstrap

Before the first publish, a maintainer must (one-off):

1. Create or confirm the `@spectastic` npm organization (`npm org create spectastic` if it doesn't exist).
2. Generate a granular access token scoped to **publishing** the `@spectastic` org only (not classic, not org-admin).
3. Add it as the `NPM_TOKEN` secret in this repo's GitHub Actions settings (Settings → Secrets and variables → Actions).

These steps happen on `npmjs.com` and `github.com`, not in this repo.

## Editing workflow

Source files in `templates/` and `specs/<id>/` link to `assets/spec.css` and `assets/spec.js` so you can iterate on the design system without touching every spec. Each `<head>` also loads the render-blocking `assets/theme-boot.js` so the saved theme + mode apply before first paint (no flash). The verb commands rewrite `../assets/` → `../../assets/` on copy, so a freshly scaffolded artifact picks up the boot script at the right depth automatically; to retrofit existing artifacts in bulk, run `node scripts/retrofit-theme-boot.mjs` (idempotent, depth-aware). When you want to ship one as a single attachable file:

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

v0.1. Templates, design system, and four slash commands shipped. The spec for spectastic itself (`specs/000-spectastic/spec.html`) is the canonical reference for what a finished artifact looks like.

Open questions are tracked in §9 of [the spec](./specs/000-spectastic/spec.html#questions).
