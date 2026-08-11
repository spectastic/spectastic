# Changelog

## Unreleased

_Nothing yet._

## v0.1.0-pre.17 … v0.1.0-pre.23 — 2026-07-08 to 2026-07-28

These seven tags shipped continuously and were not changelogged at the time; the entries below were
written as one rollup afterwards. Individual tag boundaries are in the git history.

**The guarantee layer (030, 031).** `spectastic init --tools` moves the mandatory steps off command
markdown, where a model can skip them, and onto the git boundary: a pre-commit gate that runs validate
and rejects the commit on any error, plus drift-proof `.claude/commands/` adapters generated from source
with a `commands-drift` check that fails a commit while an installed adapter has diverged. Principles
apply became kernel-owned, the first verb to use that path.

**Profiles and the enforcement floor (041, 042, 043).** `init --profile lean|standard|verified|enterprise`
seeds a profile-shaped `principles.html` and a lean `AGENTS.md`, deterministically. `spectastic enforce`
detects which enforcement categories a toolchain actually covers and exits non-zero on a gap at the
hard-gate tiers. The category set grew to nine — adding coverage (a *declared* threshold, never a bare
library), observability (a deliberate exporter, never a transitive tracing lib), and contract-first
(interface-gated, so a project with no detected interface is exempt rather than warned). Per-category
waivers landed with justification and expiry in their shape, secure-by-default and never folded into
covered. `spectastic gitignore --stack` writes ecosystem ignores into a marked, append-only block.

**Artifact security (045, 046).** Artifacts are data, not instructions. A deny-by-default content-security
policy in all eight templates, a `no-executable-content` rule at error severity, and fencing of artifact
text in the AI verbs. Backed by an injection red-team fixture and a corpus scan that run as a blocking
`security-review` CI job — a security finding fails the build rather than being logged.

**Objectives and their trace (047, 048).** A first-class `<spec-slo>` element carrying the full objective
shape, targeted at a quantified requirement, plus an Observables trace in the verify view that pairs each
requirement with its objectives — or a quantification-aware gap, so a reliability-shaped requirement with
no objective is loud while a non-reliability one stays quiet.

**Stack selection (050).** A design-stage stack interview whose recommendations are context-seeded from
the project, never drawn from a house catalog, and explicitly crownless where no source implies a winner.

**The knowledge corpus family (051–059, 061–063).** A committed, greppable `knowledge/` directory shaped
as a portable Agent Skill. Documents carry stable ids and provenance; a decision cites one pinned to the
edition it was read against, with prior editions retained rather than overwritten. Citation integrity is
gated — a dangling citation errors, a superseded one warns. When a corpus exists it is *injected* into
every AI-verb prompt rather than merely pointed at, and the adversarial critic gains a domain-contradiction
angle. An adapter brings an existing markdown folder or `llms.txt` into the convention without ever
guessing a license, origin, or edition. A two-layer identity migration made coordinates federation-unique,
and a corpus became discoverable by default.

**Corpus extraction and conversion (064, 065).** The whole subsystem moved out of `@spectastic/core` into
a standalone `@spectastic/corpus` package with its own `spectastic-corpus` binary, usable with no spec
lifecycle present, adding a deterministic get/query/grep read path. The one-way boundary — corpus must
never import core — is enforced in CI. `corpus convert` shells out to a user-installed converter to bring
PDFs and other formats in as cited documents; none is bundled.

**Course teaching payload (019, 060).** A course objective's reading widens into an optional structured
payload — analogy, contrasting cases, worked example, illustration — each verified like any other
reference, with a blind fit check that flags a mis-mapped analogy before the course is written. Course
verification became keyless and in-host.

**New package: `@spectastic/corpus` (064-corpus-package-extraction).** The whole `knowledge/` subsystem — curation, citation, provenance, licensing, prompt injection — moved out of `@spectastic/core` into a standalone workspace package, with a new **`spectastic-corpus`** binary usable with no `@spectastic/core` or `specs/` present: the existing curation verbs (`adapt`/`import`/`interview`/`source`/`publish`), a new deterministic **get/query/grep** read path (get resolves one document by citation; query is a metadata substring search; grep is full-text over document bodies, ripgrep-backed when present on `PATH`, a pure-Node scan otherwise — both paths verified byte-identical), and corpus-intrinsic `validate`. `@spectastic/core`'s AI verbs and `@spectastic/cli`'s validate scans now depend on `@spectastic/corpus` rather than owning the logic directly; the one-way boundary (corpus must never import core) is a CI-enforced `dependency-cruiser` rule. Slice 1 of the [corpus-extraction survey](docs/corpus-extraction-considerations.html); parity is total (the pre-existing test suite passes unchanged, plus a new golden-snapshot test locking the injected prompt block byte-for-byte).

**Attribution trailers (027-git-trailers).** With `git.trailers = on` (default off; acts only when `git.auto` commits), the git layer derives commit-footer trailers from the artifact's `<spec-meta>` + lifecycle: `Author`, `Reviewed-by`, `Co-authored-by` (author≠committer), `Acked-by` (the risk-pass dispositioner), and `Refs` — **humans only**, each omitted when its source is absent, never faked. The assisting model is acknowledged distinctly as `Assisted-by: <model>` (a tool acknowledgment, not authorship), emitted only on AI-coupled verb commits. This refines the project's AI-attribution stance — CONTRIBUTING now permits `Assisted-by` while keeping authorship human. Carries two meta-spec amendments: REQ-LIFECYCLE-004 records the reviewer on In Review→Accepted, and REQ-CHANGE-004 gains a `by=` recording the risk-pass dispositioner (the `Acked-by` source). The `AIProvider` interface gains `model`; `extractSpecMetadata` gains the header fields.

**The opt-in git layer (026-git-strategy).** spectastic can now drive git for you, **off by default**. A root `spectastic.json` `git.auto` switch (`off` | `commit` | `branch+commit`) lets each verb derive its own branch and Conventional-Commits subject from the artifact it just wrote: `spec` opens the `NNN-slug` branch and commits `spec(NNN): <title>`; the other verbs commit on the current branch. Spec-less verbs (`triage` list-intake, `principles`, an inbox-card `implement` drain) use the unscoped `<verb>: <subject>` form — scope omitted, never faked (FR-002/FR-007). The commit is gated on a clean in-process `spectastic validate` (a quarantined exploration or any finding ⇒ no commit, surfaced loudly), composes after the P-6 state-gate, stages only the verb's own paths (never a blanket `git add -A`), and never squashes or rewrites history. New-slice id allocation is origin-aware (`git fetch` + `origin/<default>` scan) with a local-scan fallback when there's no remote; the shipped 025 `spec-id-unique` gate remains the cross-branch safety net. Every verb gained `--commit` / `--no-commit`. The `init --tools` installer and attribution trailers are sibling slices, not yet shipped.

## v0.1.0-pre.16 — 2026-06-23

First published build since pre.14 — pre.15 (StubAIProvider) was changelogged but never released, so this rolls it up. The bulk is the theme system and four new/expanded slices, plus a run of meta-spec lifecycle hardening.

**Themes — calm × vivid, light × dark (016 + 017).** Two orthogonal axes: theme owns typography + structure, mode owns colour, both pure-CSS over `data-theme`/`data-mode`, applied before paint, WCAG AA across all four combinations. `spectastic-vivid` reproduces the reference design at the component level (pills, carded surfaces, single-column measure). A **sticky top header** — brand/back-link → `index.html`, artifact path, theme dropdown, sun/moon mode toggle — now ships in **both themes**: vivid a dense backdrop-blurred bar, calm a minimal flat treatment; the controls moved out of the footer (FR-009). Canonical spectrum brand mark (017).

**`/spectastic.explain` — grounded coaching (018 + 019).** A new opt-in extended verb: an in-chat grounded read of a spec / requirement / decision / file that cites only confirmed source. `--course` generates a persistent, grounded course with a quiz gate (per-answer feedback + verdict). Browser-verified gate behaviour (`tests/course.gate.spec.ts`).

**VS Code extension (020).** An in-editor, read-only lifecycle canvas — renders a spec's `principles → … → triage` graph with health signals (budget, open questions, risks, status), vertical-by-default layout, and file-watch refresh. Behaviour-first tests (containment + on-screen bounds, not just presence).

**Lifecycle hardening (meta-spec).** Grounded planning — plan SHOULD ground design-bearing facts; a MUST-gate stops an ungrounded must-decision reaching tasks (REQ-LIFECYCLE-006). Apply accepts-and-routes — a proposal's §6 folds into the target's `tasks.html`; apply never implements (REQ-CHANGE-006). The `<spec-questions>` zero-form is unambiguous — no open questions ⇒ no `<li>`, rationale in a `<p>` (REQ-AUTHOR-005) — backed by a `no-placeholder-question` validate rule. Triage root-cause laddering (REQ-LIFECYCLE-007): climb the regeneration test and classify at the lowest layer whose fix passes it — a bidirectional gate against both symptom-classing and spec inflation.

**Fixes.** CLI `gateOnDestinationState` widened for `exactOptionalPropertyTypes` (I-031); quiz-gate closure-over-`var`; decision-grounding renders as a labelled `dl` row instead of a floating badge; dead footer theme-toggle dropped from the templates; "interactive HTML needs a browser-level test" added to the verification discipline.

## v0.1.0-pre.15 — 2026-06-17

Mid-cycle release covering the P-6 lifecycle ratification + a substantial test-infrastructure expansion. Six logical landings rolled up into one tag:

**Principles ratification — P-6 added.** New principle: *Draft is loose, ratified is locked*. Codifies the Draft-vs-past-Draft asymmetry surfaced by four sibling triage cards (008/009/011/012 T-001) where authoring verbs treated destination existence as the gate instead of destination state. Principles bumped v1.0.1 → v1.1.0. Adversarial pass on P-6 produced three risks; all mitigated in P-6's body before apply (distinguishes Draft / terminal / reversible-to-Draft; defers to REQ-LIFECYCLE-004's FSM; scopes "without ceremony" to the change-management cycle only).

**Cascade quartet applied.** Four sibling proposals citing P-6:
- 008/FR-004 MODIFIED → refuse-if-exists scopes to past-Draft (principles verb)
- 009/FR-012 ADDED → destination-state gate (tasks verb; newly anchored, was impl-only)
- 011/FR-003 MODIFIED → invocation gate on state, not argument shape (spec verb)
- 012/FR-003 MODIFIED → auto-re-entry gates on `<spec-status>` (plan verb)

**CLI hotfix shipped at one boundary.** New `gateOnDestinationState` helper in `packages/cli/src/state-gate.ts` plus `extractSpecStatus` in `@spectastic/schema`. Kernel stays pure; CLI owns the gate. Draft → in-place edit (`Editing Draft` stderr); past-Draft → refuse exit 2 with pointer to `/spectastic.propose`; `--force` bypass emits a warning naming the change-management surface being skipped.

**Version-policy half closed (008/T-001 finished).** FR-008 ADDED + kernel hotfix: generated `principles.html` Draft artifacts default to `v0.1.0`, MUST NOT cross `1.0.0` while Draft, graduate at the bundled-flip prompt. Closes the v1.0.0-while-Draft contradiction from the original smoke test.

**Template surface gaps drained (I-022..I-025).**
- New `templates/triage-log.html` — closes the root cause of this week's three-missing-footers bug (the triage skill instructed copying from `examples/` because the template didn't exist).
- `id="P-N"` cascade to `templates/principles.html` + the kernel renderer — fresh principles generation now ships working `#P-N` anchors.
- `templates/principles.html` header pre-fills `v0.1.0` per FR-008 with an inline HTML comment naming the constraint.
- `init` file-count contract updated (16 → 17) to match the new template.

**Retroactive audit + light/dark rename.** Tasks-file audit across 008/012/013/014 ticked 69 boxes that shipped in pre.10/pre.13/pre.14; stale 002/T-001 triage card marked done; "toggle theme" label renamed to "light/dark" across 60 live shipping files (archived/withdrawn preserved verbatim per the I-013 precedent).

**CLI integration tests for the 8 verb subcommands.** New `packages/cli/test/<verb>.integration.test.ts` files for each verb — 32 tests covering state-gate behaviour (refuse / edit-in-place / `--force` warn), error paths, deterministic happy paths for `implement` + `apply`, and wiring-proof paths for AI-using verbs. Real bug caught in flight: `spec.ts` + `plan.ts` constructed `ClaudeProvider` before the state-gate ran — fixed by moving construction to after the gate so the informative refuse/warn message stays reachable when `ANTHROPIC_API_KEY` is missing.

**StubAIProvider + SPECTASTIC_AI_STUB injection point (015).** Foundation for deterministic AI-verb integration testing per the new `feedback-ai-in-ci-uses-stubs` memory. New `@spectastic/core/providers/stub` exports `StubAIProvider` implementing the full `AIProvider` interface (`chat`, `ask`, `subagent`) as a drop-in for `ClaudeProvider`. Reads a JSON script — `{ chat?, ask?, subagent? }` — and consumes responses sequentially. Hand-rolled load-time validator (no Zod dep) throws `StubAIProviderError` with the offending JSON path on schema mismatch. CLI factory `packages/cli/src/ai-factory.ts` routes based on `SPECTASTIC_AI_STUB=path/to/script.json`; both branches lazy-loaded so cold-start stays unaffected. All 6 AI-using verbs gained one happy-path integration test using committed fixture scripts at `packages/cli/test/fixtures/<verb>-script.json`. Spec/plan/tasks for the slice authored under `specs/015-ai-stub-injection/` (15 FRs total; 21 tasks across 5 phases; INVEST self-check + principles-check + 4 ADRs + architecture sketch all clean).

Suite: **165 tests pass across 28 files** (was 112/19 in pre.14). Bench all 4 scenarios within budget.

Deferred (named in 015's out-of-scope register with `defer-to=`):
- `TBD-smoke-tier-tests` — `pnpm test:smoke` script that re-runs the integration tests against real Claude when a key is set
- `TBD-ollama-provider` — `OllamaProvider` class for local-only prompt-iteration testing
- `TBD-stub-record-mode` — recording mode that captures real Claude responses into a stub script

## v0.1.0-pre.14 — 2026-06-16

Backfill release: per-verb unit tests + bundled-flip CLI fix + slash-command markdown updates.

Real bug fix:
- **`spectastic implement` now actually surfaces the bundled flip prompt**. Pre-fix, the CLI subcommand reported `flipPromptFired: true` from the kernel but never asked the author to confirm or wrote the bundle flips. The kernel still reports the signal; the CLI now (a) reads sibling spec.html + design.html, (b) prompts via stdin (`[y/N]`), (c) rewrites all three status pills + appends matching changelog entries on confirm. `--yes` flag added for non-TTY contexts.

Coverage backfill:
- **Per-verb unit tests for 011/012/013/014** authored via four parallel sub-agents. 7 tests each, 28 total, all passing. Full suite is 112/112 across 19 files (was 84/15 in pre.13).
- Tests cover: estimability gate refusals (012), defensive risk status forcing (013), adversarial heuristic per condition (013), bundled-flip-prompt firing conditions (014), re-entry mode (011/012), missing-ai guards.

Discoverability:
- **Slash-command markdown for 007–014** now each carries the "Optional: CLI dispatch" footer per 006 FR-009. Notes the `ANTHROPIC_API_KEY` requirement for the CLI path; the slash-command path inside Claude Code stays key-free.

What's still not done (post-pre.14 honest list):
- No CLI integration tests for the 8 new subcommands beyond compile-time wiring + the kernel unit tests. The existing `cli.test.ts` only exercises `validate`.
- No real-Claude smoke test against any of the new verbs; the kernel functions are exercised only through stub `AIProvider`s.
- 012's planned `helpers/interview.ts` extraction (D-007) still deferred; interview primitives stay inline in `spec.ts`.

## v0.1.0-pre.13 — 2026-06-16

Final batched release: kernel verbs 011 + 012 + 013 + 014 land together.

The 011/012/013/014 specs each planned their own slice + release (pre.13 through pre.16). Session-capacity constraints forced batching them into one ship. Per-slice spec + plan + tasks artifacts stay intact for the lifecycle audit; the per-slice release tags (pre.13–pre.16) collapse into this single pre.13 tag.

- **`specCommand`** at `@spectastic/core/commands/spec` (011): single AI-led interview pass authoring spec.html from a feature description; re-entry mode via `input.existingSpec`.
- **`designCommand`** at `@spectastic/core/commands/design` (012): estimability gate refuses on open blockers; generates ADRs + alternatives + principles check; refuses on principles VIOLATION. Interview helper extraction (012 D-007) deferred — interview primitives stay inline in spec.ts until the shape settles across multiple verbs.
- **`proposeCommand`** at `@spectastic/core/commands/propose` (013): drafts proposal + auto-fires adversarial pass per the heuristic (must-tier touched | removed-op | ≥2 topic prefixes). **`ClaudeProvider.subagent()`** lit up — replaces 007's stub with a real `messages.create` carrying a critic-role system prompt. Risk findings default to `status="identified"` per 013 D-005; status transitions are caller-side.
- **`implementCommand`** at `@spectastic/core/commands/implement` (014): single-task mode only; drain modes carved to TBD-core-implement-drain per 014 D-008. T-NNN ticks tasks; I-NNN ticks inbox just-do cards; bundled flip prompt fires when remaining unchecked count reaches zero on a Draft spec (REQ-LIFECYCLE-005).
- **CLI subcommands** for all four: `spectastic spec`, `spectastic design <spec-id>`, `spectastic propose <spec-id> "<description>"`, `spectastic implement <T-NNN | I-NNN>`. All require `ANTHROPIC_API_KEY`.
- 84/84 existing tests stay green. Per-verb tests for 011/012/013/014 deferred for capacity; the architectural seams are covered by the existing triage/principles/tasks/apply test suites + CLI integration.

Also flipped: **010-core-apply bundle** (pre.12 verified) and bundles for **011/012/013/014** all Draft → Accepted per REQ-LIFECYCLE-005.

**Multi-session arc complete.** All 8 verb extractions specced + planned + tasks-broken-down + implemented + published. The kernel pattern is end-to-end live.

## v0.1.0-pre.12 — 2026-06-16

Fifth kernel verb: `apply` (+ withdraw mode). Fully deterministic; no AI.

- **`applyCommand`** at `@spectastic/core/commands/apply` handles both apply and withdraw via discriminated `ApplyInput | WithdrawInput` (010 D-004). Targeted string replacement on stable `<spec-requirement id="…">` anchors (D-001); atomic folder move via `fs.rename` (D-002, D-003); risk-status gate refuses with structured error if any `<spec-risk status="identified">` remains (D-005).
- **`FileSystem.rename(from, to)`** added — first additive extension to the FileSystem surface from 006.
- **CLI subcommand**: `spectastic apply <spec-id> <slug>`; `--withdraw --reason "…"` for the withdraw path.
- 84/84 tests pass (was 81; +3 new kernel apply tests).

Also flipped: **008-core-principles bundle** (catching up; pre.10 verified) and **009-core-tasks bundle** (pre.11 verified) both Draft → Accepted per REQ-LIFECYCLE-005.

## v0.1.0-pre.11 — 2026-06-16

Fourth kernel verb: `tasks` — generates 5-phase tasks.html from spec + plan.

- **`tasksCommand`** at `@spectastic/core/commands/tasks` reads spec.html + design.html via `ctx.fs`, parses via `@spectastic/schema`'s new `extractSpecMetadata` helper, derives a deterministic 5-phase task skeleton from the FRs, lightly enriches task titles via `ai.chat()`, and emits `<spec-warning>` if any requirement is unreferenced (FR-008).
- **`@spectastic/schema` surface extension**: `extractSpecMetadata(htmlOrDoc)` returns `{ specId, fr[], nfr[], sc[] }`. First sibling slice to extend the schema's API. Pre-1.0 minor bump.
- **CLI subcommand**: `spectastic tasks <spec-id>`. Reads `specs/<id>/spec.html` + `design.html`; writes `tasks.html`. Refuses if exists unless `--force`.
- 81/81 tests pass (was 77; +4 new kernel tasks tests).

Also flipped: **008-core-principles bundle Draft → Accepted** per REQ-LIFECYCLE-005 on confirmation that v0.1.0-pre.10 is live on npm.

## v0.1.0-pre.10 — 2026-06-16

Third kernel verb: `principles` — fresh-generation only.

- **`principlesCommand`** at `@spectastic/core/commands/principles` extracts the `/spectastic.principles` slash verb (the smallest of the slash family). Single `ai.chat()` call generates principle bodies; kernel returns the rendered HTML; caller writes it. Refuse-if-exists logic lives caller-side per 008 D-002 (the CLI subcommand checks before writing, exits 2 on conflict unless `--force`).
- **CLI subcommand**: `spectastic principles --name <project> [--tagline …] [--count N] [--force] [--output path]`. Requires `ANTHROPIC_API_KEY` in the environment.
- **Slash-command markdown** gains a brief CLI-dispatch note per 006 FR-009.
- 77/77 tests pass (was 72; +5 new kernel principles tests).
- Bench unbroken; lazy-loading discipline holds.

Also lands in this commit: **007-core-triage bundle flipped Draft → Accepted** per REQ-LIFECYCLE-005, on confirmation that `@spectastic/{cli,core,schema}@0.1.0-pre.9` are live on npm with provenance and the CLI behaviour matches the slash-command flow.

## v0.1.0-pre.9 — 2026-06-16

Second kernel verb: `triage`, plus the first concrete `ClaudeProvider`.

- **`triageCommand`** at `@spectastic/core/commands/triage` extracts the `/spectastic.triage` slash verb. Single-card + list-intake both in scope. Eight layer classifications; LLM-based with `ask<T>()` escalation on ambiguity. Caller passes `startingIdT` + `startingIdI` so the kernel stays pure (no destination paths inside).
- **`ClaudeProvider`** at `@spectastic/core/providers/claude` — first concrete `AIProvider` implementation. `chat()` via `@anthropic-ai/sdk`'s `messages.create`; `ask<T>()` via structured-prompt + JSON parse + one stricter retry; `subagent()` ships as a stub throwing "lands with 013-core-propose" so the surface is forward-looking (007 spec FR-008 + 006 D-004).
- **ANTHROPIC_API_KEY redaction**: every error from SDK calls is rewrapped as `ClaudeProviderError`; the key value is scrubbed from `.message` + `.stack` substrings. Unit-tested on a deliberately-triggered error path.
- **CLI subcommand**: `spectastic triage [description]` (reads arg or stdin); flags `--spec <id>`, `--mode single|list`, `--format human|json`. Requires `ANTHROPIC_API_KEY` in the environment; the slash-command path inside Claude Code does not.
- **List-intake heuristic**: ported verbatim from the slash-command markdown's discipline — newlines, commas/semicolons, bullet markers, numbered items, phrases like "things/items/stuff."
- **Slash-command markdown** gains an "Optional: CLI dispatch" section pointing at the new subcommand per 006 FR-009.
- **Bench unbroken**: `init-help-cold-start` p50 stays at ~99 ms (vs 150 ms budget); `@anthropic-ai/sdk` is lazy-loaded only via the `@spectastic/core/providers/claude` subpath. 72/72 tests pass (was 68; +4 new kernel triage tests).

Seven more verb extractions queued ([008](./specs/008-core-principles/spec.html) through [014](./specs/014-core-implement/spec.html)). Each follows this same shape.

## v0.1.0-pre.8 — 2026-06-16

First kernel verb extracted. Foundation for Tier 2 (MCP) + Tier 3 (VS Code) + Tier 6 (web editor) reach.

- **New package `@spectastic/core`** at `packages/core/`. Third pnpm-workspace package alongside `cli` + `schema`. Houses the verb kernel — one TypeScript module the CLI, the future MCP server, and the future VS Code extension all share. Synced version with cli + schema; published with provenance under `next`.
- **`validateCommand` extracted** to `@spectastic/core/commands/validate` per [spec 006-kernel-extraction](./specs/006-kernel-extraction/spec.html). The CLI's `validate` subcommand now imports from core; behaviour is byte-identical (same exit codes, same output formats, same finding shape). Full-project validate still returns `✓ no findings`; 68/68 tests pass (was 64, +4 from kernel unit tests).
- **Per-verb subpath exports** (`./commands/validate`, `./providers/node-fs`) keep the lazy-loading discipline. Importing `@spectastic/core` (the main entry) loads zero command code — only types. The bench's `init-help-cold-start` scenario is the regression guard.
- **Forward-looking `AIProvider` interface** declared in v1 with `chat` + `ask<T>` + `subagent` even though validate uses none of them. Means the 007-core-triage PR that lands the first Claude implementation and the 013-core-propose PR that lights up `subagent()` are both additive rather than interface-extending breaking changes.
- **Pre-1.0 versioning policy** documented in `packages/core/README.md`: breaking changes to the kernel API may land in minor version bumps until 1.0.0. Downstream consumers should pin with `~0.x.y`, not `^0.x.y`.
- **Bench regression check**: `validate-full-project` p50 184 ms (vs 175 ms M1 dev baseline = +5%, well within the ±20% NFR-002 target). All four bench scenarios within budget.
- **Publish workflow version-verify gate extended** to cover all three packages — `cli`, `schema`, `core` — must share the tag's version or the workflow fails.

Seven sibling kernel-extraction slices ([007-core-triage](./specs/007-core-triage/spec.html) through [014-core-implement](./specs/014-core-implement/spec.html)) are speccced and ready to plan once 006 ships.

## v0.1.0-pre.7 — 2026-06-16

Closes the third slicing-consistency rule: cross-file parent/child reciprocity.

- **New rule `parent-child-reciprocity`** (cross-file). For every doc with `<spec-parent specid="X">`, when X is also in the validation set, X must contain a reciprocal `<spec-out-of-scope> <li defer-to="<this-spec-id>">`. The two halves of a slice carve-out must point at each other.
- Single-direction only (child → parent). The reverse direction would over-fire on legitimate non-parent/child defer-tos.
- Fires only when both parent and child are in the validation set. Single-doc validation skips it; the test harness was extended to support multi-file directory fixtures so this rule can be exercised properly.
- Together with `spec-parent-well-formed` and `no-broken-defer-to`, this completes the slicing-consistency triplet identified by the 16 Jun 2026 audit and listed under [examples/slicing-gaps.html §5](./examples/slicing-gaps.html#deferred).
- 64 tests pass (62 → 64 from the new rule's positive/negative pair, now using the directory-fixture loader).

## v0.1.0-pre.6 — 2026-06-16

Ships the two new validator rules to npm consumers.

- **New rule `no-broken-defer-to`** (cross-file). `<spec-out-of-scope defer-to="…">` values must be `never`, `TBD` / `TBD-<topic>`, or a well-formed spec ID. The existence-of-target check fires only when the validation set contains 2+ documents, so `spectastic validate path/to/single.html` doesn't false-positive on cross-spec references. Use `spectastic validate "specs/**/*.html" "examples/**/*.html"` (or wider globs) to engage the existence check.
- **New rule `spec-parent-well-formed`** (per-file). `<spec-parent>` must declare a non-empty `specid=` attribute matching the spec-id format (`<digits>-<lower-kebab>`). Catches the common drift where an author copies `<spec-parent>` from the template but forgets to fill in the ID.
- Together the two rules form the practical lower bound on parent/child slicing consistency. Strict cross-file reciprocity remains a follow-up; see [examples/slicing-gaps.html §5](./examples/slicing-gaps.html#deferred).
- 62 tests pass (60 → 62 from the two new fixture pairs). No breaking changes for callers; the new rules emit `error`-severity findings on documents that previously validated cleanly only when those documents had the underlying defect.

## v0.1.0-pre.5 — 2026-06-16

Republish that ships the I-019 / I-020 / T-002 follow-ups already on disk.

- **`commands/spectastic.implement.md` step 8 tightened** per the new `REQ-LIFECYCLE-005` (sibling-bundling rule). The post-tick predicate is now "zero remaining unchecked checkboxes after every tick taken while the spec's status is `Draft`" — a deterministic re-evaluation rather than an LLM heuristic on "the last one," and scoped to Draft to avoid re-confirmation loops on already-flipped specs. On confirmation, all three sibling artifacts (`spec.html`, `design.html`, `tasks.html`) flip together as one gesture.
- **`spectastic -V` now reports the actually-installed version** (I-020). Previously the CLI read its version from a hard-coded literal; now it reads the package's own `package.json` at runtime via `import.meta.url`. Cosmetic but it removes a foot-gun: the CLI is no longer able to lie about its identity.
- The CLI's top-level description was updated to "Single-file HTML spec tooling: bootstrap a project with `init`; validate spec-html artifacts with `validate`." in v0.1.0-pre.4; this republish bundles the updated commands directory under `_bundled/.claude/commands/` so `spectastic init` writes the tightened step 8 prose to new projects.

No runtime behavior changes for the `validate` or `init` subcommands themselves. Spec [meta-spec](./specs/089-lifecycle-contract/spec.html#REQ-LIFECYCLE-005); proposal [2026-06-16-lifecycle-sibling-bundling](./specs/000-spectastic/changes/archive/2026-06-16-lifecycle-sibling-bundling/proposal.html).

## v0.1.0-pre.4 — 2026-06-16

npm-page polish that should have ridden with the first publish.

- **`@spectastic/cli` description** now names both subcommands (`init` + `validate`) instead of just `validate`. Previous wording underrepresented what the CLI does post-Tier-1.5.
- **`packages/cli/README.md`** authored. Previously the npm page showed "This package does not have a README"; now it surfaces the two-subcommand surface, the install line, the exit-code contract, and provenance verification.
- **`license: MIT`** added to both `package.json` files (the LICENSE file at repo root existed since 788e607 but neither package declared it — npm pages displayed `none`).
- **Keywords** added to both packages: `spectastic`, `spec-driven-development`, `specs`, `lifecycle`, `html`, `linter`, `validator`, `ci`, `sarif`, plus per-package specifics (`init`/`scaffold`/`cli` for cli; `ast`/`parse5` for schema). Helps npm search.
- **`homepage` / `repository.directory` / `bugs`** added to both — the npm "Repository" link now resolves to the right subdirectory.

No runtime behavior changes; only manifest + docs.

## v0.1.0-pre.3 — 2026-06-16

**First publish to npm.** Both `@spectastic/cli` and `@spectastic/schema` are now installable as `npm i -g @spectastic/cli@next`. Spec [004-npm-publish-workflow](./specs/004-npm-publish-workflow/spec.html).

### Publish workflow

- `.github/workflows/publish.yml` — two jobs sharing the install/build/typecheck/test gates. The `dry-run` job validates the workflow on PRs that touch it (caught two real defects in the smoke test — pnpm/`packageManager` conflict + typecheck-before-build ordering). The `publish` job verifies the tag matches both packages' versions, derives the dist-tag (pre-releases → `next`, bare semver → `latest`), publishes both with `--provenance` via GitHub OIDC, and writes a workflow summary.
- `.github/dependabot.yml` — weekly bumps for GitHub Actions and npm ecosystems. Already proven on day one: `actions/checkout` v4→v6 and `pnpm/action-setup` v4→v6 PRs both went green through the dry-run job.

### Install

```sh
npm i -g @spectastic/cli@next
spectastic init                    # bootstrap a project
spectastic validate "*.html"       # check artifacts
```

### Provenance

Each version page on npmjs.com displays a verified-source attestation linking to the originating commit and GitHub Actions run. Cryptographic signature verifiable via `npm audit signatures`.

### Known quirk

npm's first-publish behavior auto-tagged both packages on `latest` in addition to the requested `next` — for the first version, `npm view @spectastic/cli dist-tags` shows `{ next: '0.1.0-pre.3', latest: '0.1.0-pre.3' }`. Self-corrects on the next bare-semver release (the workflow will overwrite `latest` when a `vX.Y.Z` tag without a hyphen ships).

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
