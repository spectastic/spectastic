---
description: Write a feature specification — what to build, for whom, and how success is measured. Use when starting a new feature, specifying requirements and success criteria, or capturing what a feature must do before designing the implementation — not project-wide rules (/spectastic.principles), the how (/spectastic.design), or throwaway learning (/spectastic.explore).
argument-hint: <feature name or one-line description>
triggers:
  - "write a spec for a feature"
  - "specify what to build"
  - "define requirements and success criteria"
  - "start a new feature"
  - "what should this feature do"
use-when: "Capturing what a single feature must do, for whom, and how success is measured — before designing the implementation."
sibling-boundary: "Not principles (project-wide rules, not one feature); not design (the how); not explore (throwaway learning before a spec exists)."
model: inherit
---

# /spectastic.spec

You are drafting a **feature specification** as a single-file HTML artifact in the spectastic design system. A spec describes *what* a feature is, *who* it's for, and *how* we'll know it worked. It does **not** describe *how* to build it — that belongs in the design.

## Inputs

User input (from `$ARGUMENTS`): a feature name or one-line description.

## Procedure

1. **Pick a Spec ID**. Format `NNN-kebab-feature` (e.g. `001-auth-service`). If the user supplied no number, scan `specs/` for the highest existing number and increment by one.

2. **If the user names a parent spec** (e.g. "scaffold a slice of `012-editor-ui` covering inspector dispatch only"), note the parent ID. The new spec is *still a regular spec.html* — the only mark of slicehood is the `<spec-parent specid="…">` reference in the header. Use a tighter Spec ID under the same numbering scheme (or with a child suffix if the user prefers, e.g. `012a-…`).

3. **Create the directory**: `specs/<spec-id>/`.

4. **Copy** `templates/spec.html` to `specs/<spec-id>/spec.html`.

   **Adjust asset paths on copy.** The template's `<link>` and `<script>` use `../assets/spec.css` (one level up — correct for in-place preview from `templates/`). The destination is two levels deep (`specs/<spec-id>/`), so on copy rewrite `../assets/` → `../../assets/` for both the stylesheet and the script. Adjust any `<a href="../principles.html">` similarly to `../../principles.html`.

5. **Skip what's known.** Before any interview question, check `$ARGUMENTS`, any existing `spec.html` in the directory, and the principles document for answers you already have. Don't re-ask. Only interview for what's genuinely missing.

6. **Two-phase interview.** Discovery in chat (free-form narrative), decisions via `AskUserQuestion` (bounded choice). The goal is to leave no unresolved open question by write-time — open questions in the final artifact signal that the interview failed.

   **Chat phase (free-form narrative answers):**
   - Context: what exists today, why it isn't enough, what triggered this spec
   - User stories — each *As a [ROLE], I want to [DO_THING] so that [OUTCOME]*
   - Edge cases and assumptions
   - Data model — the **conceptual** model only (075-spec-data-model-layering): the entities this feature owns or substantially changes, the relationships between them, the invariants that must always hold, and the state transitions they undergo. Ask what a thing *is* and what must be true of it, never how it is persisted or serialised. The **physical** model (field types, storage shape, wire representation) and the consumer-facing contract belong downstream in the design's *Data model & contracts* section — redirect there rather than capturing them here. Precision **is** in scope where an invariant genuinely requires it (a range, a uniqueness rule, a decimal precision that changes what is correct); "no fields" does not mean "no numbers".
   - Out-of-scope items: where each one lives instead (capture as `defer-to=`)

   **Decision phase — use `AskUserQuestion` to anchor each of these before writing:**
   - **Smallest demoable** — always the first question. If the user reaches for "the whole feature" or "all surfaces at once", push back: the answer is the slice boundary, and it tells you the spec is probably too big as scoped. Offer 2–3 framings.
   - **Story priorities** (e.g. for each US: P1 / P2 / P3 — one AskUserQuestion call per batch of stories, multiSelect off)
   - **Critical scope splits** that the chat phase surfaced — e.g. "Offline support? Must / Nice / Out of scope"; "Data model: new entities / extend existing / both"
   - **Quantified targets** — for any NFR mentioned in chat that wasn't a number, ask for the threshold (e.g. "p95 latency under 200 ms / 500 ms / 1 s")
   - **Any binary you'd otherwise capture as `<spec-question>`** — promote it to an AskUserQuestion before write-time

   Rules:
   - Limit each `AskUserQuestion` call to ≤4 questions; each question to 2–4 options. Loop if needed.
   - Don't use `AskUserQuestion` for narrative answers (TL;DR, user-story text). Those stay in chat.
   - The first option should usually be the recommendation, labelled accordingly.
   - If a decision genuinely cannot be answered yet, leave it as a `<spec-question>` — but only after attempting `AskUserQuestion` first.

   **Interview depth — non-obvious questions only, continue until complete.**

   The interview is bounded by *decision exhaustion*, not by question count. Loop `AskUserQuestion` calls until: every decidable question is anchored to a concrete choice; every genuinely-undecidable question is documented in `<spec-questions>` with reasoning; and no obvious-to-a-careful-reviewer question remains unasked.

   Ask the questions a careful reviewer would surface but that aren't obvious from a first reading — edge cases, failure modes, scope boundaries, tradeoffs the user hasn't named, contradictions between adjacent user stories. **Don't burn `AskUserQuestion` calls on questions whose answers are self-evident** from `$ARGUMENTS`, the user-story text, or upstream artifacts; surfacing the obvious wastes the user's attention and trains them to click through.

   **Re-entry mode.** If `/spectastic.spec <spec-id>` is invoked against an existing `specs/<spec-id>/spec.html`, run the same two-phase interview against the existing artifact. Chat phase surfaces new context or shifted intent; decision phase asks the non-obvious questions the original interview missed (or the new ones that became visible after time away from the spec). Extend existing requirements with `<details>` rationale where appropriate, or add new requirements where a gap is real. **Do not overwrite or remove existing content without explicit confirmation** — re-entry sharpens; it does not redraft.

7. **Author the artifact.** Fill the template's requirements:
   - Functional requirements with stable IDs `FR-001`, `FR-002`, … and a `priority` of `must | should | may`
   - Non-functional requirements `NFR-001`, … (perf, security, privacy, accessibility — quantified per the decision phase)
   - Out-of-scope items in `<spec-out-of-scope>` with `defer-to="<sibling-spec-id>"` or `defer-to="TBD"`
   - Success criteria `SC-001`, … — **technology-agnostic and measurable**
   - **INVEST self-check**: fill the six `<dl class="invest">` rows. `V` must link to a success-criterion ID; `T` must link to an acceptance scenario or requirement. If any row is honestly `✗`, the spec is not ready to estimate — flag it.
   - Only the truly-unresolved questions go into `<spec-questions>`. If anything answerable made it here, loop back to step 6.
   - **Zero open questions has one form (`REQ-AUTHOR-005`).** When none remain, the `<spec-questions>` register MUST carry no `<li>` — each `<li>` counts as one open question to every consumer (health extraction, the lifecycle needs-attention signal, validators). Put any "resolved because…" rationale in a `<p>` (e.g. `<p>None outstanding — every decision was anchored in the interview.</p>`), never a placeholder or "None" `<li>`.

8. **Discipline**:
   - Every requirement must use an RFC 2119 keyword wrapped in `<spec-rule>` (or `<spec-rule level="should">` / `<spec-rule level="may">`).
   - Stable IDs survive forever. If a requirement is dropped, status becomes "Withdrawn" but the ID is never reused.
   - If you would write `[NEEDS CLARIFICATION: …]`, do — leave it in place as a `<spec-question>` admonition; do not invent answers.
   - Success criteria are outcomes, not implementations. "Users complete sign-up in under 90 seconds at the 80th percentile" — not "we use a faster auth library".

9. **Validate** against the principles at `./principles.html` (if present — principles are optional). If any principle would reject this spec, flag it in a `<spec-warning>` and either revise or ask the user to amend the principles.

10. **Watch the budget gauge.** `<spec-budget>` renders live word/requirement/read-time counts as the file is saved. If your draft hits the amber band (70%+ of budget), stop and ask: *"Should some of this be its own slice?"* Use the **Out-of-scope (deferred)** section as the answer — move items there with `defer-to="TBD"` and consider scaffolding the sibling spec separately.

11. **Conformance**. The auto-built conformance index at the end of the document picks up every `<spec-requirement>` automatically — no manual update needed.

## Output style

- Replace every `[PLACEHOLDER]`. Never leave one.
- Keep paragraphs short. Reviewers skim.
- Use `<details>` for rationale and long examples so the spec reads as a flat sentence at default zoom.
- Use `<spec-sidenote>` for marginalia that would interrupt flow.

## After writing

Report the path, count of requirements, and propose `/spectastic.design` next.

## Optional: CLI dispatch

Per 006 FR-009: for deterministic dispatch outside Claude Code (CI scripts, raw shell automation), the LLM MAY invoke `spectastic spec` via Bash. This bypasses LLM-driven file handling and routes through `@spectastic/core/commands/spec` directly. The markdown procedure above remains canonical; the CLI is an alternate code path.

The CLI requires `ANTHROPIC_API_KEY` in the environment for AI-coupled verbs; the slash-command path uses the in-host Claude session and needs no key.
