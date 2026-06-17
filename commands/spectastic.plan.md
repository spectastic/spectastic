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

6. **Skip what's known.** Before any interview question, check `$ARGUMENTS`, the surrounding codebase (file tree, package.json, Cargo.toml, lockfiles), and the spec for answers you already have. Don't re-ask. Only interview for what's genuinely missing.

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
   - Decisions have stable IDs `D-001`, `D-002`, … forever. Superseded decisions keep status `superseded` and link to the replacement.
   - The architecture sketch (inline SVG) is **required** if the feature has more than one moving part. Keep it small — fewer than ~8 boxes; if you need more, sketch the slice, not the system.
   - Alternatives must include a scored matrix with one row marked `data-winner`. The winner must be the one actually chosen.
   - Do not duplicate the spec. Link to its requirement IDs (`<a href="./spec.html#FR-001">FR-001</a>`) rather than restating them.

9. **Validate**. Re-walk Principles check. Now that the plan is written, does any decision violate a principle you marked OK earlier? If yes, fix the decision or escalate.

## Output style

- Replace every `[PLACEHOLDER]`.
- Decisions favor brevity. A four-line Decision row is better than a paragraph.
- Use `<spec-warning>` for risks the user must accept before implementation; use `<spec-assumption>` for things this plan takes as true.

## After writing

Report the path, the principles version checked against, and propose `/spectastic.tasks` to derive the work list.

## Optional: CLI dispatch

Per 006 FR-009: for deterministic dispatch outside Claude Code (CI scripts, raw shell automation), the LLM MAY invoke `spectastic plan` via Bash. This bypasses LLM-driven file handling and routes through `@spectastic/core/commands/plan` directly. The markdown procedure above remains canonical; the CLI is an alternate code path.

The CLI requires `ANTHROPIC_API_KEY` in the environment for AI-coupled verbs; the slash-command path uses the in-host Claude session and needs no key.
