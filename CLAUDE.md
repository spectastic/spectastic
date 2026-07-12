# CLAUDE.md — spectastic

Project-local context for Claude Code. Notes that should *not* appear in shipping copy but *do* shape decisions.

## What spectastic is

Single-file HTML spec tooling. Lifecycle: principles → spec → plan → tasks → implement → propose → apply → triage. Every artifact is a self-contained `.html` file that opens in a browser; the design system lives in `assets/spec.css` and `assets/spec.js`.

## Voice and copy

The product stands on its own. **User-facing copy references principles, not personalities.** When tempted to write "after Maggie Appleton" or "Tufte-style," say what the principle is — *calm typography*, *warm cream surface*, *margin notes*. Canonical links to real artifacts (Tufte CSS, RFC 2119, ADR, OpenSpec, the data-ink-ratio Wikipedia page) are fine and useful. Named individuals as the basis of a recommendation are not.

**No internal artifact ids on user surfaces (P-10).** The same rule, one level up: spectastic's own artifact ids — spec numbers/slugs, `REQ-*`, `FR-*`, `T-*`, `P-*`, `D-*` — are provenance for the people *building* the tool, not information for the people *using* it. The line to hold is **tool-talking vs artifact-provenance**: what the *tool* emits (CLI `--help` text, error/diagnostic messages, tool-managed markers like the pre-commit hook stamp and the managed-adapter marker) must carry no internal id — say what the flag/behaviour *does*, and put "which spec added it" in a code comment or commit trailer. But a spec/plan **artifact** citing its own governing ids as anchors — its `<spec-changelog>` entry, an author-supplied apply summary (`REQ-CHANGE-008`), the provenance line a generator writes into a spec/plan it produces — is legitimate per P-3, the human's voice, *not* a leak. (So don't scrub `implement.ts`/`graduate.ts`'s generated-changelog ids; do scrub help/message/marker copy.) This binds the meta-spec's own tooling and every downstream project alike. The `no-internal-id-in-copy` validate rule ([`packages/core/src/commands/validate.ts`](packages/core/src/commands/validate.ts) `copyLeakFindings`, folded in by the CLI's `scanCopyLeak`) enforces, at error severity, the CLI's own `.description`/`.option`/`.argument` help strings (an illustrative argument slug uses the neutral placeholder `001-auth-service`, allowlisted) — a **floor, not a cap** — and the pre-commit gate blocks a leak. Its reach is bounded **permanently by design**: a downstream project's application copy is unseeable, and finding `message:`/`fixHint:` copy legitimately names the requirement it enforces, so those surfaces are **review-caught**, not linted (the honest P-8 ceiling, recorded not hidden — the same posture as the fat-core/thin-CLI convention). Owned by `REQ-FORMAT-006`; paid for by triage `T-017` (CLI `--help` shipped `(037)`, `(spec 042)`, `Spec 043.` across 30 sites).

This file is the place for the actual aesthetic lineage, since it's project-local and helps future-Claude make consistent design decisions without leaking attribution into the surface.

## Aesthetic lineage (private)

The visual system started from a study of **Maggie Appleton's site** (maggieappleton.com). The cues taken:

- Warm cream `#f6f5f1` background instead of pure white.
- Warm dark grey `#353534` instead of pure black.
- Crimson `#5f023e` for links; no underline, subtle bottom border.
- Sea-blue `#04a5bb`, purple `#7558b2`, salmon `#e1624f` as accent colours; gold `#ffd09c` for `<mark>`.
- Fraunces (serif headings), Source Serif 4 (body), Lato (small-caps metadata), IBM Plex Mono (code).
- 8 px spacing grid; fluid type scale.
- Generous line-height and a narrow ~38 rem reading measure with a ~14 rem sidenote gutter.

**Tufte CSS** (edwardtufte.github.io/tufte-css) supplied the marginalia pattern, small-caps section openers (`<spec-newthought>`), and the data-ink-ratio framing.

**Bret Victor's Explorable Explanations** influenced the philosophy of progressive interactivity — the document is the artifact; readers can probe it but don't need a separate tool to do so.

**Don't surface these names in shipping copy.** Describe the principle, not the source.

## Inspiration log for ideas yet to come

When evaluating any future design influence, capture the *principle* version here. The shipping copy gets the principle; this file gets the breadcrumb.

| Source | Principle to keep | Where it ships |
| --- | --- | --- |
| Tufte CSS | Margin notes, small-caps openers, data-ink ratio | "Margin note", "small-caps section opener", "data-ink ratio" |
| Maggie Appleton's site | Warm cream, serif-led essay feel | "Calm typographic system" |
| Will Larson, ["good engineering strategy is boring"](https://lethain.com/good-engineering-strategy-is-boring/) | Brevity — "most people don't read long documents"; aim for one to two pages. The principle is brevity, **not** a "1,500-word rule" (he never set a word count — that attribution was fabricated and removed) | "Specs that cross the threshold are signalled for splitting" |
| Bill Wake, INVEST (2003) | Six story-quality criteria | "INVEST self-check" (acronym is the principle) |
| DORA / Reinertsen / Humble | Small batches reduce lead time and error | "Small-batches discipline" |
| Mike Cohn / Gojko Adzic | Vertical slicing, "How would you demo just this?" | "Smallest demoable" prompt |
| Michael Nygard | ADR shape (Context / Decision / Consequences) | "ADR" (canonical link); `<spec-decision>` carries the structure |
| Edward Tufte | Sidenotes, sparklines, marginalia | "Sidenotes", "sparkline-style architecture diagrams" |
| [ISO 31000](https://www.iso.org/iso-31000-risk-management.html) — risk register | Risks raised at design time become statused artifacts, not chat | `<spec-risk>` + `<spec-risk-log>` populated by the propose-time adversarial pass; gates apply on user-confirmed status |
| Thariq (Anthropic) — "interview me" pattern | Non-obvious questions only; continue until decision-exhausted; aggressive `AskUserQuestion` coverage as a discrete pass | `/spectastic.spec` decision-phase discipline ("Interview depth"); documented as a standalone invocation pattern in the Interview discipline section below |

## Commands

Eight slash commands. Don't add more without a good reason — OpenSpec's small command surface is one of its wins worth preserving.

- `/spectastic.principles` — non-negotiable principles
- `/spectastic.spec` — feature spec; carries the smallest-demoable prompt + INVEST self-check
- `/spectastic.plan` — implementation plan; refuses to run while blockers exist
- `/spectastic.tasks` — task breakdown
- `/spectastic.implement` — implement the next unchecked task or `just-do` inbox card; mark complete; loop to drain
- `/spectastic.propose` — change proposal with typed `<spec-delta op="…">`; runs an adversarial risk pass on non-trivial proposals (must-tier touched, removed op, or ≥2 topic prefixes) — three findings land as `<spec-risk>` blocks under §5 Risk register; opt-out `--no-adversarial`, opt-in `--adversarial`
- `/spectastic.apply` — apply approved proposal (moves to changes/archive/ as a side effect); refuses if any `<spec-risk status="identified">` remains. Withdraw mode `--withdraw <YYYY-MM-DD>-<slug> --reason="…"` rejects an authored proposal (moves to changes/withdrawn/, parallel to archive/, with a "Considered, withdrew" entry on the live spec changelog)
- `/spectastic.triage` — single-defect classification *or* list-intake mode (paste a list; one card per item; appends to `inbox.html`); inbox cards MAY carry `data-status="rejected"` for the pre-propose rejection path

**Keep `.claude/commands/` in sync with `commands/`.** The slash commands the harness actually loads live in `.claude/commands/*.md` — these are **gitignored, one-time copies** of the source-of-truth in `commands/*.md`. They do **not** auto-sync. So whenever you edit a `commands/*.md` source (or a proposal lands a change to one, e.g. apply step 8 / `REQ-CHANGE-006`), re-sync immediately:

```bash
cp commands/*.md .claude/commands/
cp agents/*.md .claude/agents/   # subagent definitions (spec 044), same footing
```

Skip this and the running slash command is stale — which is exactly meta-spec triage **T-006**: a 13 Jun `.claude/commands/spectastic.apply.md` copy predated the fold step, so an apply silently skipped the §6 fold (T-004 reproduced live). Until `spectastic init --tools` owns install/sync (deferred), this re-copy is manual. The `agents/*.md` subagent definitions (spec `044-verb-model-policy`) sync the same way to `.claude/agents/` (both gitignored copies); `prebuild.mjs` bundles both into `_bundled/.claude/` for `init` to ship.

### Command frontmatter: the skill-invocation metadata contract

Per `REQ-TOOL-004`, every command surfaced as a skill carries **structured invocation metadata** in its source frontmatter, alongside `description` and `argument-hint`:

- `triggers:` — a list of the intents/phrasings that should invoke the verb.
- `use-when:` — a one-line framing of when to reach for it.
- `sibling-boundary:` — what disambiguates it from adjacent verbs (spec vs plan vs explore; propose vs apply vs triage).

The keys are the **machine-checkable contract** (the `skill-metadata-shape` validate rule warns on any missing one) and skill-creator's inputs. The `description` is the **fixed, `/skill-creator`-tuned trigger surface** the harness router actually reads — authored and committed, *not* generated from the keys at sync time (so the string that gets evaluated is the one that ships). Where a key and the `description` diverge, the `description` is authoritative. When adding a new verb, author all three keys and tune the description; `spectastic validate` flags the omission.

**Optional `model:` key — the verb model policy (spec `044-verb-model-policy`, `REQ-TOOL-004`).** A command MAY additionally carry an optional `model:` key declaring the model tier it runs on — an alias (`opus` / `sonnet` / `haiku` / `inherit`), never a pinned id. It is not one of the three required keys; the `skill-metadata-shape` rule ignores it. The tiers are the single source of truth in `@spectastic/core/model-policy` (`VERB_MODEL_POLICY`): **implement / apply / tasks → `sonnet`** (single-turn autonomous verbs take a clean turn-scoped downgrade); **spec / plan / propose / triage / explain / principles / explore → `inherit`** (reasoning-and-interview verbs stay on the session model — a frontmatter override would leak across their multi-turn chat interviews anyway). The `verb-model-policy` validate rule (P-8, the enforcement half) errors on an illegal alias or a value that disagrees with the map, so the permitted key never lacks machine coverage. Subagent tiers live the same way in `agents/*.md`: `spectastic-classifier` and `spectastic-impl-task` on `sonnet`, `spectastic-critic` on `inherit`. `implement --model opus` escalates a hard task by delegating its authoring to the Opus-pinned impl-task subagent. Headless (`spectastic <verb>`): `--model <tier>` / `SPECTASTIC_MODEL` / the `spectastic.json` `models` section resolve through the same precedence into the provider and the `Assisted-by:` trailer.

**Reliability caveat (T-009).** These descriptions are a *UX nudge for triggering, not a guarantee* — a skill is advisory to the model. Two `run_loop` pilots confirmed descriptions can't force invocation, and nothing in the markdown can force the interview to happen or the commit to run. Guarantees for mandatory steps live in the **kernel or CI**, never in command markdown — see [`docs/guarantee-layer-considerations.html`](docs/guarantee-layer-considerations.html) and triage T-009.

## Interview discipline in commands

Slash commands that gather requirements (`spec`, `plan`, `propose`, `triage`) follow a **two-phase interview**:

- **Chat phase** for narrative answers (intent, context, user-story text, reason/migration prose). Free-form, natural conversation.
- **Decision phase** uses the `AskUserQuestion` tool to commit the user to bounded choices (priorities, scope splits, quantified targets, layer classification, status pills, op type per delta).

Why both: open-ended capture in chat keeps the conversation natural; `AskUserQuestion` commits the user to discrete decisions that would otherwise leak into `<spec-question>` registers and never get resolved.

**The discipline:** an unresolved `<spec-question>` in a finished artifact signals that the interview failed. Before writing, anchor every decidable question via `AskUserQuestion`. Only genuinely-undecidable items survive into `<spec-questions>`.

**Rules:**
- `AskUserQuestion` accepts 1–4 questions per call; each question 2–4 options; multiSelect supported.
- First option is usually the recommendation, labelled `"(Recommended)"`.
- Use chat (not `AskUserQuestion`) for paragraph-length or genuinely open-ended answers.
- Loop `AskUserQuestion` calls if a phase has more than 4 decisions to make.
- Skip questions whose answers are already in `$ARGUMENTS`, the existing file, or upstream artifacts.

**Interview depth.** The decision phase is bounded by *decision exhaustion*, not by question count. Loop until every decidable question is anchored, every undecidable one is documented with reasoning, and no obvious-to-a-careful-reviewer question remains unasked. Ask the non-obvious ones — edge cases, failure modes, scope boundaries, tradeoffs the user hasn't named. The decision phase replaces what other SDD tools ship as a discrete `/clarify` verb; spectastic's verb count stays at 8 because the work happens inline.

**For aggressive coverage on an existing spec.** Users who want a deeper pass without re-running `/spectastic.spec` can invoke the pattern directly: *"Read this @<path-to-spec.html> and interview me using `AskUserQuestion` about literally anything — technical implementation, UI & UX, concerns, tradeoffs. Non-obvious questions only. Continue until complete, then update the spec."* `/spectastic.spec` honours the same shape when invoked on an existing `spec.html` (re-entry mode); the standalone pattern is the version users reach for when they want the discipline without going through the command.

## The small-batch loop

`inbox.html` at project root is the entry point for "I've got a few small things." Two new `<spec-triage>` `layer=` values handle routing:

- `just-do` — implement immediately, no proposal cycle. One file, no contract change, revert-safe.
- `defer` — back-burner with a `defer-to=` pointing at a sibling spec ID, `TBD-<topic>`, or `never`.

Flow: paste list → `/spectastic.triage` writes classified cards to `inbox.html` → `/spectastic.implement` drains the `just-do` queue. Cards stay in the inbox after completion (`data-status="done"` adds a strike-through and DONE pill) so the history is visible.

The lifecycle's heavy ceremony is still there for items that genuinely need it — `spec`, `plan`, `propose`, `apply`. The small-batch loop is the complement, not the replacement.

## Sizing discipline (implemented)

Tier 1 components added — `<spec-budget>`, `<spec-out-of-scope>` with required `defer-to=`, `<spec-parent>`, `<dl class="invest">`. Existing commands gained behavioural upgrades (smallest-demoable prompt in specify, estimability gate in plan, budget-aware splitting nudge in propose). No new verbs. See `README.md` for the retrofit recipe.

The sizing-budget contract is owned by `REQ-FORMAT-004` (meta-spec): RAG bands are **green ≤ 80%, amber 80–100%, red > 100%**, and the **Words** row counts *authored* prose — the auto-built `<spec-conformance>` index is excluded (it's generated, not written), while read-time keeps the whole-document count. The amber band sits at the industry-standard 80% "approaching limit" warn point (AWS CloudWatch / queueing theory), not the earlier 70% — that band fired on 67% of specs and was overridden as routine (alert fatigue). The `assets/spec.js` band value is drift-guarded against `REQ-FORMAT-004` by a schema rule.

## Verification discipline

**Anything that generates interactive HTML needs a browser-level test, not just a structural one.** Schema validation (`spectastic validate`) and string assertions ("the `<script>` is present", "no `disabled` attribute") prove an artifact is *well-formed* — they cannot prove its JavaScript *works*. A behaviorally-broken-but-present enhancement passes every structural check.

The lesson is paid for: `019-explain-course`'s quiz gate shipped a closure-over-`var` bug that marked only the last objective, and the SC-003 test (which only asserted the gate script existed) went green. It was caught by a human opening the artifact. The fix added `tests/course.gate.spec.ts` — Playwright drives a generated course and asserts the *answered* objective is the one marked.

Rules of thumb:
- Generators of interactive artifacts (`assembleCourse`, theme JS, `<spec-tabs>`/gate behaviour) get a Playwright spec under `tests/` that *runs the JS and asserts behaviour*, plus a cheap structural backstop in vitest (e.g. "the gate script carries no `var`").
- A green checkmark on a structural-only test is not "verified" for anything with a runtime. Before claiming an interactive feature works, open it in a browser (the MCP Playwright connector) and exercise it.
- **Presence is not containment.** For anything *positioned* — cards that size to content, popovers/menus/tooltips anchored to an element — a test that asserts "it rendered" misses the two ways layout actually breaks: content overspilling its own box, and an overlay clipped by an `overflow` ancestor or the viewport edge. Assert containment (`scrollHeight ≤ clientHeight`) and on-screen bounds (the rect sits inside the viewport), not just that the element exists. Paid for by `020-vscode-extension` T-001/T-002: the canvas nodes and hover card passed every "it renders" check and were still visibly cropped when a human opened them.
- The linter is not noise. The `var`-in-loop bug was flagged as `S1515` and waved off as "style"; it was the bug.

**The per-feature view is generated, not written.** Spec `021-verify-view` adds `verify.html` — a derived per-spec view that aggregates the SC → acceptance → test-task trace (by reference) and a Run/Demo block grounded in the real run, materialised by `/spectastic.implement` on completion or regenerated with `spectastic verify <spec-id>`. This is the *artifact* form of P-7; the rules of thumb above are how you clear the bar before that view can honestly say "done". `spectastic validate` flags a `verify.html` whose links have drifted from its bundle (the `verify-view-stale` rule) — treat that finding like any other, not as noise.

## Architecture — fat core, thin CLI

**Deterministic logic lives in `@spectastic/core`; a `packages/cli` command module is thin — it registers the commander command and delegates.** The kernel (`packages/core/src/`) owns the pure, reusable, deterministic units — parsers, detectors, policy diffs, file merges, artifact composition. The CLI (`packages/cli/src/commands/*.ts`) is the edge: a `register<Verb>` that parses args, calls core, and prints/exits. This is P-8 restated at the package boundary — the *guarantee* is the kernel, the CLI is just how you invoke it — and it keeps logic testable without spawning a binary.

The boundary is a **judgment call, not a mechanical rule**: cross-cutting deterministic logic another verb could reuse belongs in core (e.g. `enforce/detect`, `enforce/policy`, `gitignore/apply`); helpers that are purely one command's own scaffolding/orchestration may stay CLI-local under `commands/<verb>/` (e.g. `init/`'s profile prompt, conflict loop, bundle plan). Ask: *"would a second caller — another verb, a Workflow, a test — want this without the CLI?"* If yes, it's core. Adding a core module is cheap: a `tsup.config.ts` entry + a `package.json` `exports` subpath.

**This scar is paid for.** 041, 042, and 043's first pass all drifted deterministic logic into the CLI because the convention lived only as an unwritten habit — caught in review (`042/T-001`, the 043 move `0cb5330`). There is deliberately **no lint rule** for it: a mechanical "no non-`register*` export in `commands/`" check would false-positive on the legitimate CLI-local `init/` helpers, and the real distinction (kernel-worthy vs command-scaffolding) can't be linted without judgment. So it's **review-caught** — that a machine can't enforce it is itself flagged as a meta-spec triage (`000/T-016`), not hidden.

### Data/content deltas — proposing a change to a manifest, not a requirement

A change to profile *data* (`spectastic-profiles.json` — 041's principle presets, 042's enforce categories) is a proposal like any other, but its `<spec-delta>` is a **data/content delta**: `target=` names the manifest key/path (e.g. `standard/shape-of-system-principles`), and the delta embeds a `<spec-diff>`, **not** a `<spec-requirement>`. The apply kernel branches on that — a delta with no embedded `<spec-requirement>` makes **no change to the live spec's requirements body** (it still folds §6 tasks, appends the changelog, and archives); the real manifest edit is a §6 task drained by `/spectastic.implement`. This is the contract's answer to triage **T-018**, where an early data delta (no `<spec-requirement>`) was fabricated into a phantom `<spec-requirement priority="must">` and injected into 041's `spec.html`. A requirement-shaped `target=` (`^[A-Z]+-`) that forgets its embedded post-state is now an **error** (the `data-delta-shape` validate rule + the apply-time gate-block); a manifest-key target is unambiguously data. Owned by `REQ-CHANGE-002` / `REQ-CHANGE-008`; the pattern every 041/042 manifest proposal uses.

## Things deferred

Captured in `docs/openspec-considerations.html` and `specs/000-spectastic/spec.html` §2 (Out of scope):
- ~~`spectastic init --tools` installer~~ — **now specced + built as `031-init-tools`** (the guarantee-layer installer: pre-commit validate gate + drift-proof command adapters, closing the T-006 `.claude/commands` sync footgun)
- `spectastic validate --strict` CLI for CI (the sibling still deferred → `TBD-validate-strict`)
- Cross-tool installers (Cursor / Aider / Copilot)
- Action-detecting `/spectastic.next`
- A `/spectastic.split` retrofit command (the workflow does this with existing verbs)
- ~~A way to *relax* a floor category without disabling the whole gate~~ — **now built as 042's `2026-07-11-relax-a-requirement`** (MODIFY FR-004, ADD FR-011/012/013 + a data delta): a per-category **waiver** in `spectastic.json` (`enforce.waivers[]` of `{category, reason, until, owner}`) that demotes a required-but-uncovered category from a blocking gap to an advisory **`relaxed`** tally — never silent, never folded into covered. Justification + expiry are part of the shape (boilerplate reason / missing owner / past-or-over-365-day `until` are rejected); it's **secure-by-default** (absent/malformed/expired → the gate fires) and **two-guarded** (P-8): `enforce` fails *closed* at runtime (`loadWaivers` drops malformed entries), the `enforce-waiver-well-formed` validate scan fails *loud* at the git/CI boundary. `security` + `supply-chain` are **un-relaxable at enterprise** (`enforce.unwaivable`, per-profile manifest data). The prior art (ISO 27001 Statement of Applicability, tfsec `:exp:` auto-expiry, Kyverno secure-by-default exceptions, Conftest's separate exception tally, comply-or-explain) shaped it; the adversarial pass mitigated an NFR-001 determinism contradiction (expiry reads an **injected clock**, default system date, so fixtures pin it) and named the PR as the v1 approval surface. Coupled **P-9** amendment landed (v1.7.0) naming the waiver as the sanctioned "recorded" form. Follow-ons: `TBD-waiver-register-artifact` (a rendered Statement-of-Applicability view), `TBD-waiver-approval` (separation of duties), `TBD-verify-waiver-trace` (waivers in `verify.html`).

### Open research → considerations docs (11 Jul 2026)

Three web-backed considerations docs, each surveying the landscape and landing one recommendation with a named next artifact (the guarantee-layer/verify pattern — survey precedes the spec/principle):

- [`docs/agent-architecture-considerations.html`](docs/agent-architecture-considerations.html) — the SDD leaders *prompt* for architecture per-project, never prescribe a house pattern; recommends plan-stage pattern-*awareness* (a decision-phase choice → ADR), not a default. → `TBD-plan-architecture-prompt`, `TBD-architecture-fitness-function`.
- [`docs/coverage-enforcement-considerations.html`](docs/coverage-enforcement-considerations.html) — coverage splits by nature: the diff-aware *measurement/gating discipline* → a 7th `coverage` enforcement category in verified/enterprise; the *threshold number* → plan stage, like Perf targets. → `TBD-coverage-enforcement-category` **(landed** 11 Jul as 042's 7th enforce category (MODIFY FR-002, ADD FR-010), applied via <code>2026-07-11-coverage-enforce-category</code>. The adversarial pass reshaped it twice: detection matches only a **declared threshold/check** (`fail_under` / `coverageThreshold` / a JaCoCo `check`), never a bare coverage library, so presence never falsely certifies the floor; and new **FR-010** generalises the existing "undetectable stack → warn" rule to the *category* level (a `STRUCTURALLY_UNDETECTABLE` map in `packages/core/src/enforce/policy.ts`, today `{ coverage: ['go'] }`), so coverage sits in the verified/enterprise hard floor without false-failing Go (`go test -cover` is flag-only). Surfaced copy (the `compose.ts` AGENTS floor block) is narrowed to say a threshold is configured, never that a CI diff-gate runs — the real diff-gate stays `TBD-coverage-diff-gate`.**), `TBD-plan-coverage-threshold` (landed via P2b).
- [`docs/spec-injection-considerations.html`](docs/spec-injection-considerations.html) — HTML is a worse injection surface than markdown across browser + LLM + supply-chain boundaries; recommends a layered posture (CSP + a `no-executable-content` validate rule + fence/sanitize artifact text in the AI verbs) anchored by an "artifacts are data, not instructions" principle. → `TBD-security-principle` **(landed** 11 Jul as `principles.html` <a href="./principles.html#P-11">P-11</a> (v1.6.0), applied via the spec-030 kernel path (`spectastic apply principles`) — the first principles proposal to use it. Adversarial pass reshaped the wording: no named mechanisms (avoids staleness — the security spec below owns the control set), a carve-out for the sanctioned `spec.js`/`theme-boot.js` (avoids contradicting P-4), and a deterministic/posture split (avoids overclaiming on unsolved prompt injection).**), `TBD-artifact-security-spec`, `TBD-security-review-ci`.
- [`docs/engineering-principles-considerations.html`](docs/engineering-principles-considerations.html) — which downstream-project "constitution" principles to offer (Library-First, contract/OpenAPI-first, and the broader canon) and at *which profile tier*. Key insight: Library-First + contract-first fit agents because they give a fixed inspectable target; and unlike Spec Kit's single untiered constitution, spectastic's profiles can *ladder* principles by rigor (industry-grounded via DORA/SAMM/DSOMM + YAGNI). Recommends adding contract-first + Library-First at *standard* first. → `TBD-profile-principle-catalog` **(landed** 11 Jul via 041 apply `2026-07-11-profile-principle-catalog` — the **lean-four** at standard: contract-first, Library-first, secure-by-default, least-privilege, repeated into verified+enterprise. The adversarial pass trimmed it from the full seven — semver/supply-chain/accessibility deferred to `TBD-profile-principle-catalog-next` — and split the observability/SLO rows out to `TBD-observability-slo-principle`. A drift-guard test in `packages/cli/test/init/profiles.test.ts` guards the cumulative-by-repetition copies.**), `TBD-contract-first-enforce`, `TBD-profile-interfaces-axis`.
- [`docs/observability-slo-considerations.html`](docs/observability-slo-considerations.html) — makes the NFR → SLO → SLI → instrumentation chain first-class at the elevated profiles. SLIs/SLOs descend from NFRs, but spectastic captures NFRs and consumes nothing (verify.html traces only SC). Recommends four tiered moves: an observability/SLO principle, an `observability` enforce category (detects Micrometer/Actuator/Quarkus/OTel/Prometheus — statically detectable), SLOs linked to NFRs (representation presented, not decided), and a verify-page observables trace giving NFRs a proof leg (extends P-7). Taxonomy: Four Golden Signals default, RED for services, USE for resources. → `TBD-observability-enforce-category` **(landed** 11 Jul as 042's 8th enforce category (MODIFY FR-002), applied via <code>2026-07-11-observability-enforce-category</code>. Detects a metrics registry/exporter/starter dependency by its **deliberate export name** (micrometer-registry-prometheus, spring-boot-starter-actuator, prometheus/client_golang, @opentelemetry/exporter-prometheus, prometheus-client, the Rust prometheus crate) — never a transitive core/tracing lib (@opentelemetry/api), which the adversarial pass caught as a false-positive. **Second user of FR-010**: Swift + C++ have no exporter-manifest convention, so `STRUCTURALLY_UNDETECTABLE` gains `observability: ['swift','cpp']` (warn, never false-fail) — validating that machinery's extensibility. Verified+enterprise hard floor, kept hard on the deliberate-exporter-choice signal; the "present ≠ wired" ceiling (a declared exporter ≠ a live /metrics endpoint) is recorded like the security category's.**), `TBD-observability-slo-principle` **(landed** 11 Jul via 041 apply `2026-07-11-observability-slo-principles` — **Structured observability** at verified (repeated into enterprise) + **Service level objectives** at enterprise only. Both advisory (P-8); the enforce category, the SLO/NFR artifact, and the verify-page trace remain the three still-open TBDs below. First proposal applied on the new data/content-delta contract (REQ-CHANGE-002/008, triage T-018) — its apply touched only the changelog, confirming the fix.**), `TBD-slo-nfr-artifact`, `TBD-verify-slo-trace`.
