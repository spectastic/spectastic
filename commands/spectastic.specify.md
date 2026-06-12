---
description: Write a feature specification — what to build, for whom, and how we know it worked.
argument-hint: <feature name or one-line description>
---

# /spectastic.specify

You are drafting a **feature specification** as a single-file HTML artifact in the spectastic design system. A spec describes *what* a feature is, *who* it's for, and *how* we'll know it worked. It does **not** describe *how* to build it — that belongs in the plan.

## Inputs

User input (from `$ARGUMENTS`): a feature name or one-line description.

## Procedure

1. **Pick a Spec ID**. Format `NNN-kebab-feature` (e.g. `001-auth-service`). If the user supplied no number, scan `specs/` for the highest existing number and increment by one.

2. **If the user names a parent spec** (e.g. "scaffold a slice of `012-editor-ui` covering inspector dispatch only"), note the parent ID. The new spec is *still a regular spec.html* — the only mark of slicehood is the `<spec-parent specid="…">` reference in the header. Use a tighter Spec ID under the same numbering scheme (or with a child suffix if the user prefers, e.g. `012a-…`).

3. **Create the directory**: `specs/<spec-id>/`.

4. **Copy** `templates/spec.html` to `specs/<spec-id>/spec.html`.

5. **First interview question — always.** Ask the user: *"What is the smallest version of this a user could see and use?"* Capture the answer for the `<b>Smallest demoable</b>` row in `<spec-meta>`. If the answer is "the whole feature" or "all surfaces at once", push back — the answer is the slice boundary, and it tells you the spec is probably too big as scoped.

6. **Interview the rest** with depth proportional to the feature's risk. For a small change, three more questions are enough; for a new subsystem, work through every section. Capture:
   - One-paragraph TL;DR — what the feature is, who it's for, the single most important outcome
   - Context: what exists today, why it isn't enough, what triggered this spec
   - User stories — **each independently testable**. Use the format _As a [ROLE], I want to [DO_THING] so that [OUTCOME]_. Priorities P1/P2/P3.
   - Edge cases
   - Functional requirements with stable IDs `FR-001`, `FR-002`, … and a `priority` of `must | should | may`
   - Non-functional requirements `NFR-001`, … (perf, security, privacy, accessibility — quantified)
   - **Out of scope (deferred)** — for every item, ask "where does this live instead?" Capture as `<spec-out-of-scope>` with `defer-to="<sibling-spec-id>"` or `defer-to="TBD"` when no slice exists yet. The intent is to convert scope-cutting into deferral — items don't get dropped, they get pointed at.
   - Data model: only the entities this feature owns or substantially changes
   - Success criteria `SC-001`, … — **technology-agnostic and measurable**
   - **INVEST self-check**: fill the six `<dl class="invest">` rows. `V` must link to a success-criterion ID; `T` must link to an acceptance scenario or requirement. If any row is honestly `✗`, the spec is not ready to estimate — flag it.
   - Assumptions
   - Open questions — anything you'd flag for the user to resolve before plan time

5. **Discipline**:
   - Every requirement must use an RFC 2119 keyword wrapped in `<spec-rule>` (or `<spec-rule level="should">` / `<spec-rule level="may">`).
   - Stable IDs survive forever. If a requirement is dropped, status becomes "Withdrawn" but the ID is never reused.
   - If you would write `[NEEDS CLARIFICATION: …]`, do — leave it in place as a `<spec-question>` admonition; do not invent answers.
   - Success criteria are outcomes, not implementations. "Users complete sign-up in under 90 seconds at the 80th percentile" — not "we use a faster auth library".

7. **Validate** against the principles at `./principles.html` (if present — principles are optional). If any principle would reject this spec, flag it in a `<spec-warning>` and either revise or ask the user to amend the principles.

8. **Watch the budget gauge.** `<spec-budget>` renders live word/requirement/read-time counts as the file is saved. If your draft hits the amber band (70%+ of budget), stop and ask: *"Should some of this be its own slice?"* Use the **Out-of-scope (deferred)** section as the answer — move items there with `defer-to="TBD"` and consider scaffolding the sibling spec separately.

9. **Conformance**. The auto-built conformance index at the end of the document picks up every `<spec-requirement>` automatically — no manual update needed.

## Output style

- Replace every `[PLACEHOLDER]`. Never leave one.
- Keep paragraphs short. Reviewers skim.
- Use `<details>` for rationale and long examples so the spec reads as a flat sentence at default zoom.
- Use `<spec-sidenote>` for marginalia that would interrupt flow.

## After writing

Report the path, count of requirements, and propose `/spectastic.plan` next.
