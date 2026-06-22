---
description: Produce the implementation plan for an existing spec — stack, architecture, decisions, risks.
argument-hint: [spec-id, defaults to most recent]
---

# /spectastic.plan

You are producing an **implementation plan** for an existing spectastic specification. The plan answers _how_ we will build what the spec describes. Pair every plan with exactly one spec.

## Inputs

User input (from `$ARGUMENTS`): a Spec ID such as `001-auth-service`, or empty (defaults to the most recently modified `specs/<id>/spec.html`).

## Procedure

1. **Locate the spec**. Resolve to `specs/<spec-id>/spec.html`. Read it in full — you need every requirement and success criterion before you plan.

2. **Estimability gate (refuse to plan if blocking).** Before scaffolding anything, scan the spec for blockers:
   - Any `<spec-question>` admonition still open
   - Any `[NEEDS CLARIFICATION: …]` marker still in the text
   - Any `<spec-out-of-scope>` `<li>` missing `defer-to=` (shows as visibly broken)
   - Any INVEST row in `<dl class="invest">` marked with `<dd class="fail">`
   
   If any of these exist, **stop immediately** and report the blockers as a numbered list with file location. The user must resolve them before you plan — guessing past unresolved questions causes the spec inflation that small-batches discipline is meant to prevent.

3. **Locate the principles** at `./principles.html` (optional — skip if absent). You will validate against its principles in §1 of the plan when it exists.

4. **Copy** `templates/plan.html` to `specs/<spec-id>/plan.html`.

   **Adjust asset paths on copy.** The template's `<link>` and `<script>` use `../assets/spec.css` (one level up — correct for in-place preview from `templates/`). The destination is two levels deep (`specs/<spec-id>/`), so on copy rewrite `../assets/` → `../../assets/` for both the stylesheet and the script. Adjust any `<a href="../principles.html">` similarly to `../../principles.html`.

5. **Run the Principles check**. Walk every principle. For each, mark `OK`, `EXCEPTION`, or `VIOLATION`. An exception requires a justification logged in §8 Complexity tracking. A violation requires the user either to revise the plan or amend the principles — stop and ask.

6. **Ground the plan in verified truth (read before you interview).** Per `REQ-LIFECYCLE-006`, before any interview question, resolve every design-bearing fact against real source — the same discipline `/spectastic.explain` applies to explanations. Don't plan from memory or from how a library "probably" works.

   **Read the real ground** (this is a `SHOULD` — ground the facts a decision will actually rest on, not every file for its own sake). For each requirement and success criterion, identify what the plan will *touch or depend on* and open it:
   - **Consuming code** — the modules/functions this feature calls into or extends. Read the real signatures and control flow (Grep/Glob/Read, or the LSP tool's `goToDefinition`/`findReferences`), not just the file tree.
   - **Dependency signatures** — confirm the symbol/option you intend to use exists at the *resolved lockfile version* (open `package-lock.json` / `pnpm-lock.yaml` / `Cargo.lock` / … for the real version, not a newer one).
   - **Platform / runtime constraints** — record the actual number for any quantified limit the approach assumes (rate limit, payload cap, timeout, supported runtime).
   - **Existing patterns** — how the codebase already solves the adjacent problem, so the plan *extends rather than regenerates* it.

   **Classify each design-bearing fact** as one of:
   - `verified` — you opened the source this turn; record the citation (`path:line`, a symbol, `dep@version`, or a doc URL).
   - `spike` — decidable only by a time-boxed investigation; **run it now** (a measurement, a throwaway prototype, a query against a real system) and record the one-line finding. A spike too large to run now surfaces as the first `/spectastic.tasks` item.
   - `assumed` — taken as true without verification because verifying now costs more than it's worth.

   Record every fact as a row in **§3 Grounding & evidence** of the plan (claim → source → status → finding). This is the leading edge of the plan: a reviewer reads it to see what the plan *knows* versus *assumes*.

   **Skip what's known.** Facts you just verified don't need re-asking; check `$ARGUMENTS` and the spec too, and only interview for what grounding left genuinely open.

7. **Two-phase interview.** Discovery in chat (narrative), decisions via `AskUserQuestion` (bounded choice). Unresolved questions in the final plan signal that the interview failed.

   **Chat phase (narrative answers):**
   - High-level approach in one or two paragraphs
   - The 1–3 alternatives that were seriously considered + the criteria that mattered
   - Project structure — only the new or changed paths
   - Risks with likelihood, impact, and mitigation

   **Decision phase — use `AskUserQuestion` to anchor before writing:**
   - **Test style** (e.g. TDD / integration-first / smoke-only — pick the one with the strongest defence; recommend first)
   - **Risk tolerance** for this plan (Low — proven path / Medium — some unknowns / High — experimental)
   - **Perf budget** for any NFR mentioned in chat — get a quantified number (e.g. "p95 latency under 200 ms / 500 ms / 1 s / not in scope")
   - **Persistence shape** if storage was discussed (e.g. SQL / KV / object store / in-memory only)
   - **Each tech-stack pick** that has 2–4 reasonable contenders (language version, async runtime, test framework, etc.)
   - **Each candidate ADR** the chat surfaced — get a thumbs-up on the framing before scaffolding the decision card

   Rules:
   - ≤4 questions per `AskUserQuestion` call, 2–4 options each, multiSelect off unless explicitly batch-style.
   - First option is the recommendation, labelled `"(Recommended)"` in the label.
   - For >4 alternatives, ask in chat instead and let the user narrate the tradeoff.

8. **Discipline**:
   - Decisions follow the ADR shape: Status / Context / Decision / Consequences (with `+` positives and `−` negatives).
   - **Every decision declares its grounding.** Each `<spec-decision>` carries `grounding="verified|spike|assumed|n-a"` (`n-a` = pure judgment with no external fact, e.g. a test-style preference) and its Context cites the backing §3 Grounding row's source (`<code>src/foo.ts:88</code>`, `dep@version`, a URL). A decision missing the attribute, or `grounding="assumed"`, renders the visible `UNGROUNDED` label — the planning analogue of a `<spec-delta>` rendering `MISSING OP`. "We'll use X because it's standard" is not a citation; "X — lockfile resolves `x@4.2`, `x.foo()` confirmed in `dist/index.d.ts:88`" is.
   - Decisions have stable IDs `D-001`, `D-002`, … forever. Superseded decisions keep status `superseded` and link to the replacement.
   - The architecture sketch (inline SVG) is **required** if the feature has more than one moving part. Keep it small — fewer than ~8 boxes; if you need more, sketch the slice, not the system.
   - Alternatives must include a scored matrix with one row marked `data-winner`. The winner must be the one actually chosen.
   - Do not duplicate the spec. Link to its requirement IDs (`<a href="./spec.html#FR-001">FR-001</a>`) rather than restating them.

9. **Validate**. Re-walk the Principles check — does any decision now violate a principle you marked OK earlier? If yes, fix the decision or escalate. Then re-walk the **grounding gate** (`REQ-LIFECYCLE-006`, the binding clause): the plan is **not ready for `/spectastic.tasks`** while any `must`-tier decision is `grounding="assumed"` or an unresolved `grounding="spike"`. For each, have the user choose — the choice is theirs to commit, not yours — via `AskUserQuestion`:
   - **Verify** — read the source now; flip the §3 row and the decision to `verified` with a citation.
   - **Spike** — run the time-boxed investigation now (record the finding), or schedule it as the first `/spectastic.tasks` item.
   - **Accept the risk** — record `<spec-risk target="D-NNN" status="accepted">` with the user's one-line rationale; leave it `identified` until the user confirms, exactly as in propose §8.

   This gate is a plan→tasks *readiness* affirmation, not a Draft content-lock (P-6) — it mirrors the estimability gate in step 2. Should/may-tier and `n-a` decisions warn but do not block.

## Output style

- Replace every `[PLACEHOLDER]`.
- Decisions favor brevity. A four-line Decision row is better than a paragraph.
- Use `<spec-warning>` for risks the user must accept before implementation; use `<spec-assumption>` for things this plan takes as true.

## After writing

Report the path, the principles version checked against, and a one-line grounding summary (how many facts `verified` / `spike` / `assumed`). Propose `/spectastic.tasks` to derive the work list **only once the grounding gate is clear** — if a must-tier decision is still ungrounded and unaccepted, name that as the blocker instead.

## Optional: CLI dispatch

Per 006 FR-009: for deterministic dispatch outside Claude Code (CI scripts, raw shell automation), the LLM MAY invoke `spectastic plan` via Bash. This bypasses LLM-driven file handling and routes through `@spectastic/core/commands/plan` directly. The markdown procedure above remains canonical; the CLI is an alternate code path.

The CLI requires `ANTHROPIC_API_KEY` in the environment for AI-coupled verbs; the slash-command path uses the in-host Claude session and needs no key.
