---
description: Produce the design doc for an existing spec — stack, architecture, decisions, risks, ADRs. Use when deciding how to build an approved spec, choosing a stack or architecture, or recording technical decisions — after the spec's what, before the task breakdown (/spectastic.tasks).
argument-hint: [spec-id, defaults to most recent]
triggers:
  - "design the implementation"
  - "plan the implementation"
  - "choose the stack and architecture"
  - "write the ADRs for this spec"
  - "how should we build this spec"
  - "technical approach for the feature"
use-when: "Turning an approved spec into a technical approach — stack, architecture, decisions, risks — before breaking it into tasks."
sibling-boundary: "Not spec (the what, not the how); not tasks (the ordered breakdown that comes after the design)."
model: inherit
---

# /spectastic.design

You are producing the **design doc** for an existing spectastic specification — the implementation design that answers _how_ we will build what the spec describes. Pair every design with exactly one spec.

## Inputs

User input (from `$ARGUMENTS`): a Spec ID such as `001-auth-service`, or empty (defaults to the most recently modified `specs/<id>/spec.html`).

## Procedure

1. **Locate the spec**. Resolve to `specs/<spec-id>/spec.html`. Read it in full — you need every requirement and success criterion before you design.

2. **Estimability gate (refuse to design if blocking).** Before scaffolding anything, scan the spec for blockers:
   - Any `<spec-question>` admonition still open
   - Any `[NEEDS CLARIFICATION: …]` marker still in the text
   - Any `<spec-out-of-scope>` `<li>` missing `defer-to=` (shows as visibly broken)
   - Any INVEST row in `<dl class="invest">` marked with `<dd class="fail">`
   
   If any of these exist, **stop immediately** and report the blockers as a numbered list with file location. The user must resolve them before you design — guessing past unresolved questions causes the spec inflation that small-batches discipline is meant to prevent.

3. **Locate the principles** at `./principles.html` (optional — skip if absent). You will validate against its principles in §1 of the design when it exists.

4. **Copy** `templates/design.html` to `specs/<spec-id>/design.html`.

   **Adjust asset paths on copy.** The template's `<link>` and `<script>` use `../assets/spec.css` (one level up — correct for in-place preview from `templates/`). The destination is two levels deep (`specs/<spec-id>/`), so on copy rewrite `../assets/` → `../../assets/` for both the stylesheet and the script. Adjust any `<a href="../principles.html">` similarly to `../../principles.html`.

5. **Run the Principles check**. Walk every principle. For each, mark `OK`, `EXCEPTION`, or `VIOLATION`. An exception requires a justification logged in §8 Complexity tracking. A violation requires the user either to revise the design or amend the principles — stop and ask.

5b. **Read the profile marker (if present).** If `.spectastic/profile.json` exists (a project scaffolded via `spectastic init --profile`, spec 041), the chosen profile carries an *enforcement policy* — the categories (formatter · linter · type-checker · security · supply-chain · test-runner) its rigor requires. In the design, add a short **Toolchain / enforcement** subsection that resolves that policy to the concrete tools for this design's ecosystem, following the escalation ladder: (1) wire the ecosystem's standard gate (e.g. Ruff/mypy, Error Prone/SpotBugs, clippy, clang-tidy); (2) if a convention isn't expressible off-the-shelf, author a custom rule (Semgrep/ast-grep); (3) if the ecosystem lacks a tool, build a minimal checker (the Verified/Enterprise "build a checker when none exists" duty). Run `spectastic enforce` to see which required categories the project already covers, and design only the gaps (spec 042). Lower profiles (Lean) have no enforcement floor — skip the subsection.

   **Append the stack's ignore entries (spec 043).** Now that the ecosystem is settled, run `spectastic gitignore --stack` — it detects the stack and merges the build-artifact ignores (`node_modules/`, `__pycache__/`, `target/`, …) into the spectastic-managed `.gitignore` block, additively and idempotently (it never touches your own rules outside the block). The base block was written at `init`; this adds the stack half.

6. **Ground the design in verified truth (read before you interview).** Per `REQ-LIFECYCLE-006`, before any interview question, resolve every design-bearing fact against real source — the same discipline `/spectastic.explain` applies to explanations. Don't design from memory or from how a library "probably" works.

   **Read the real ground** (this is a `SHOULD` — ground the facts a decision will actually rest on, not every file for its own sake). For each requirement and success criterion, identify what the design will *touch or depend on* and open it:
   - **Consuming code** — the modules/functions this feature calls into or extends. Read the real signatures and control flow (Grep/Glob/Read, or the LSP tool's `goToDefinition`/`findReferences`), not just the file tree.
   - **Dependency signatures** — confirm the symbol/option you intend to use exists at the *resolved lockfile version* (open `package-lock.json` / `pnpm-lock.yaml` / `Cargo.lock` / … for the real version, not a newer one).
   - **Platform / runtime constraints** — record the actual number for any quantified limit the approach assumes (rate limit, payload cap, timeout, supported runtime).
   - **Language-idiom feasibility** — before committing an architecture, confirm it *fits the target language's hard constraints*, the way a staff engineer in that ecosystem would check by reflex: does the type system allow the shape (e.g. Java/Kotlin **sealed** hierarchies, Rust ownership/lifetimes, Go's no-generics-until-1.18, Swift value vs. reference semantics)? Is the **initialization / declaration ordering** legal (forward references, cyclic modules, static-init order)? Does the pinned toolchain/runtime version actually support the API? Ground these as `spike` (compile a throwaway snippet) when unsure — a constraint discovered at implementation is a mid-drain propose, which is exactly the failure this prompt exists to prevent (meta-spec triage `T-013`).
   - **Existing patterns** — how the codebase already solves the adjacent problem, so the design *extends rather than regenerates* it.

   **Classify each design-bearing fact** as one of:
   - `verified` — you opened the source this turn; record the citation (`path:line`, a symbol, `dep@version`, a doc URL, or — for a domain fact, when a knowledge corpus is present — a corpus document cited as `KB-NNNN@edition`).
   - `spike` — decidable only by a time-boxed investigation; **run it now** (a measurement, a throwaway prototype, a query against a real system) and record the one-line finding. A spike too large to run now surfaces as the first `/spectastic.tasks` item.
   - `assumed` — taken as true without verification because verifying now costs more than it's worth.

   Record every fact as a row in **§4 Grounding & evidence** of the design (claim → source → status → finding). This is the leading edge of the design: a reviewer reads it to see what the design *knows* versus *assumes*.

   **Grounding a domain fact against a knowledge corpus.** When a `knowledge/` corpus is present, a design-bearing **domain** fact — a settlement window, a regulatory threshold, a clinical rule — MAY be grounded `verified` by citing a corpus document as `KB-NNNN@edition` (the project-assigned, opaque, repo-unique id, resolved against the project's root `knowledge/index.md` registry) in the `<spec-decision>`'s Context. The edition pin matters: it names *which text* the claim was grounded against, so a later re-ingest at a newer edition can never silently change what the decision claimed — and it is always the referenced document's own edition, never the source marketplace's plugin version (the two are different axes). Before a corpus existed, a domain fact could only ever be `assumed`; the corpus is what lets it be `verified` against a document a reviewer can open. **Scope it to domain facts only** — a *local product decision* (a latency target, a UX choice, a stack pick) is not a domain fact and MUST NOT manufacture a corpus citation; a corpus asked to justify everything justifies nothing and hollows out the `verified` signal.

   **Skip what's known.** Facts you just verified don't need re-asking; check `$ARGUMENTS` and the spec too, and only interview for what grounding left genuinely open.

7. **Two-phase interview.** Discovery in chat (narrative), decisions via `AskUserQuestion` (bounded choice). Unresolved questions in the final design signal that the interview failed. When none remain, represent zero per `REQ-AUTHOR-005`: the `<spec-questions>` register carries no `<li>` — put any "resolved because…" rationale in a `<p>`, never a "None" `<li>` (each `<li>` reads as one open question to consumers).

   **Chat phase (narrative answers):**
   - High-level approach in one or two paragraphs
   - The 1–3 alternatives that were seriously considered + the criteria that mattered
   - Project structure — only the new or changed paths
   - Risks with likelihood, impact, and mitigation

   **Decision phase — use `AskUserQuestion` to anchor before writing:**
   - **Test style** (e.g. TDD / integration-first / smoke-only — pick the one with the strongest defence; recommend first)
   - **Risk tolerance** for this design (Low — proven path / Medium — some unknowns / High — experimental)
   - **Architecture pattern** — when the feature has more than one moving part (the same bar as the §7 architecture sketch in step 8), anchor *how the pieces are arranged* before the stack picks. Offer the domain- and stack-appropriate contenders (e.g. **layered** / **hexagonal ports-and-adapters** / **vertical-slice** / **modular-monolith**), recommending the *simplest structure the complexity actually needs* — **prompt, don't prescribe** a house pattern. The pick lands a `<spec-decision>` in §7 (with `grounding=`) that shapes the §8 Project-structure sketch, and its one-line summary fills the §2 **Architecture** row. Standing, cross-feature rules (dependency direction, "no framework in the domain core") belong in `principles.html`, not here; a trivial single-module feature skips this question. (The prompt is advisory per P-8 / T-009 — it nudges a deliberate, grounded choice; the durable enforcement, an architecture fitness function, is a separate effort.)
   - **Interface shape** (069-design-contract-section, FR-004) — asked before any format question: what interface, if any, does this feature expose — request/response, RPC, GraphQL, event-driven, or none? For event-driven, ask a direction sub-question — publishes, consumes, or both (a feature MAY expose both an HTTP surface and an event stream, per FR-007). Skipped when the spec, an upstream artifact, or detection already answers it. Fills the new §3 **Data model & contracts** section's `<spec-contract shape=… direction=…>`.
   - **Contract format** (FR-005) — seeded from the declared interface shape, never a fixed default: request/response → OpenAPI, RPC → proto, GraphQL → GraphQL SDL, event-driven → AsyncAPI. A feature declaring both an HTTP surface and an event stream seeds both formats — one `<spec-contract>` per declared interface, never a forced single choice. Presents no crown — the `(Recommended)` label from the Rules below is withheld here — when nothing decisive implies a winner (honours 050 FR-002's crownless-when-unearned stance). Fills the `path=`/`format=` attributes directly.

   **The sidecar convention** (070-contract-sidecar-convention, FR-001/FR-005): `path=` names the contract's two locations across its lifecycle, never a single fixed file. While this design is in flight, author the contract itself at `specs/<spec-id>/contracts/` — the **proposed** location, tracked alongside the spec. Promotion (071-contract-promotion) copies that file to the **effective** location: the ecosystem-conventional path this design declares, which must resolve outside `specs/`. That directory is always named `contracts/` — the knowledge corpus's citable-documents directory is a distinct, unrelated convention and its name doesn't apply here.
   - **Event compatibility direction** (077-event-schema-evolution, FR-001) — asked only when the design is changing a declared event-driven contract's payload; a design changing no published payload is asked nothing (FR-004/SC-001). When it fires: what compatibility does this change intend for *future* messages — backward, forward, full, or none? Every option states its meaning inline (never the bare registry term alone), and presents no crown — the familiar `backward` default is not recommended, since nothing in the context earns it. Fills the `compatibility=` attribute on the changed `<spec-contract>`.
   - **Event compatibility scope** (FR-003) — asked alongside the direction question above, distinguishing compatibility for *future* messages (the direction question) from readability of *already-published* ones: does the claim hold against the latest version only, or against every retained message? This is the **replay** question — a diff-based check silently collapses it, since replayed messages may have been written many versions ago. Fills the `compatibility-scope=` attribute (`latest` or `all`) alongside `compatibility=`.
   - **Perf budget** for any NFR mentioned in chat — get a quantified number (e.g. "p95 latency under 200 ms / 500 ms / 1 s / not in scope")
   - **Coverage threshold** — for a project with a coverage floor (the `coverage` enforce category), quantify the target the way Perf targets are, but state it **diff-aware**: a patch target for *changed* lines (e.g. 80% / 90% / 100% of new lines covered) plus the standing rule that *a change never lowers coverage of the code it touches* — **never a single universal project percentage** (a mandated number is a Goodhart target and 100% is a smell; the discipline is the invariant, not the number). Fills the §2 **Coverage** row; `not in scope` for a project with no coverage floor (Lean).
   - **Persistence shape** if storage was discussed (e.g. SQL / KV / object store / in-memory only)
   - **Each tech-stack pick** that has 2–4 reasonable contenders (language version, async runtime, test framework, etc.)
   - **Stack-selection interview** (optional — governed by `design.stackInterview` in `spectastic.json`, default on) — **read detection and the standing docs first**: `CLAUDE.md`/`AGENTS.md`/any linked architecture doc, the repo's detected ecosystem, and the profile's `frameworks` axis stance. For every **undecided** material stack dimension (language, framework, test framework, coverage tool, persistence, build tool — not a fixed list): skip it if a source above already answers it; surface — **never silently resolve** — a conflict where two sources disagree; otherwise offer it as a bounded choice via `AskUserQuestion`, seeding the recommendation from those same sources — **never a maintained house catalog** — with no `(Recommended)` crown when nothing decisive implies a winner. A confirmed pick fills the matching §2 row directly, and (settled either way — confirmed or self-skipped) auto-scaffolds its `<spec-decision>` in §7: the offered contenders become the Considered Options (pre-filled, not retyped), and the recommendation source is captured as a decision driver. Coordinates with, never duplicates, the Architecture-pattern question above and the profile's enforcement-tool resolution (step 5b).
   - **Frameworks-axis tie-break** — when the stack-selection interview's context doesn't decisively pick a winner, break the tie using the profile's `frameworks` axis: `minimal` leans stdlib/no-dep, `conventional` leans mainstream, `staff-level` leans the mature, batteries-included choice. Detection and standing docs still dominate — this only breaks a tie among otherwise-equal contenders.
   - **Each candidate ADR** the chat surfaced — get a thumbs-up on the framing before scaffolding the decision card

   Rules:
   - ≤4 questions per `AskUserQuestion` call, 2–4 options each, multiSelect off unless explicitly batch-style.
   - First option is the recommendation, labelled `"(Recommended)"` in the label.
   - For >4 alternatives, ask in chat instead and let the user narrate the tradeoff.

8. **Discipline**:
   - Decisions follow the ADR shape: Status / Context / Decision / Consequences (with `+` positives and `−` negatives).
   - **Every decision declares its grounding.** Each `<spec-decision>` carries `grounding="verified|spike|assumed|n-a"` (`n-a` = pure judgment with no external fact, e.g. a test-style preference) and its Context cites the backing §4 Grounding row's source (`<code>src/foo.ts:88</code>`, `dep@version`, a URL). A decision missing the attribute, or `grounding="assumed"`, renders the visible `UNGROUNDED` label — the design-time analogue of a `<spec-delta>` rendering `MISSING OP`. "We'll use X because it's standard" is not a citation; "X — lockfile resolves `x@4.2`, `x.foo()` confirmed in `dist/index.d.ts:88`" is.
   - Decisions have stable IDs `D-001`, `D-002`, … forever. Superseded decisions keep status `superseded` and link to the replacement.
   - The architecture sketch (inline SVG) is **required** if the feature has more than one moving part. Keep it small — fewer than ~8 boxes; if you need more, sketch the slice, not the system.
   - Alternatives must include a scored matrix with one row marked `data-winner`. The winner must be the one actually chosen.
   - Do not duplicate the spec. Link to its requirement IDs (`<a href="./spec.html#FR-001">FR-001</a>`) rather than restating them.

9. **Validate**. Re-walk the Principles check — does any decision now violate a principle you marked OK earlier? If yes, fix the decision or escalate. Then re-walk the **grounding gate** (`REQ-LIFECYCLE-006`, the binding clause): the design is **not ready for `/spectastic.tasks`** while any `must`-tier decision is `grounding="assumed"` or an unresolved `grounding="spike"`. For each, have the user choose — the choice is theirs to commit, not yours — via `AskUserQuestion`:
   - **Verify** — read the source now; flip the §4 row and the decision to `verified` with a citation.
   - **Spike** — run the time-boxed investigation now (record the finding), or schedule it as the first `/spectastic.tasks` item.
   - **Accept the risk** — record `<spec-risk target="D-NNN" status="accepted">` with the user's one-line rationale; leave it `identified` until the user confirms, exactly as in propose §8.

   This gate is a design→tasks *readiness* affirmation, not a Draft content-lock (P-6) — it mirrors the estimability gate in step 2. Should/may-tier and `n-a` decisions warn but do not block.

## Output style

- Replace every `[PLACEHOLDER]`.
- Decisions favor brevity. A four-line Decision row is better than a paragraph.
- Use `<spec-warning>` for risks the user must accept before implementation; use `<spec-assumption>` for things this design takes as true.

## After writing

Report the path, the principles version checked against, and a one-line grounding summary (how many facts `verified` / `spike` / `assumed`). Propose `/spectastic.tasks` to derive the work list **only once the grounding gate is clear** — if a must-tier decision is still ungrounded and unaccepted, name that as the blocker instead.

## Optional: CLI dispatch

Per 006 FR-009: for deterministic dispatch outside Claude Code (CI scripts, raw shell automation), the LLM MAY invoke `spectastic design` via Bash. This bypasses LLM-driven file handling and routes through `@spectastic/core/commands/design` directly. The markdown procedure above remains canonical; the CLI is an alternate code path.

The CLI requires `ANTHROPIC_API_KEY` in the environment for AI-coupled verbs; the slash-command path uses the in-host Claude session and needs no key.
