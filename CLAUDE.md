# CLAUDE.md — spectastic

Project-local context for Claude Code. Notes that should *not* appear in shipping copy but *do* shape decisions.

## What spectastic is

Single-file HTML spec tooling. Lifecycle: principles → spec → plan → tasks → implement → propose → apply → triage. Every artifact is a self-contained `.html` file that opens in a browser; the design system lives in `assets/spec.css` and `assets/spec.js`.

## Voice and copy

The product stands on its own. **User-facing copy references principles, not personalities.** When tempted to write "after Maggie Appleton" or "Tufte-style," say what the principle is — *calm typography*, *warm cream surface*, *margin notes*. Canonical links to real artifacts (Tufte CSS, RFC 2119, ADR, OpenSpec, the data-ink-ratio Wikipedia page) are fine and useful. Named individuals as the basis of a recommendation are not.

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

## Things deferred

Captured in `docs/openspec-considerations.html` and `examples/spectastic-spec.html` §2 (Out of scope):
- `spectastic init --tools` installer
- `spectastic validate --strict` CLI for CI
- Cross-tool installers (Cursor / Aider / Copilot)
- Action-detecting `/spectastic.next`
- A `/spectastic.split` retrofit command (the workflow does this with existing verbs)
