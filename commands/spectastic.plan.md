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

4. **Run the Principles check**. Walk every principle. For each, mark `OK`, `EXCEPTION`, or `VIOLATION`. An exception requires a justification logged in §8 Complexity tracking. A violation requires the user either to revise the plan or amend the principles — stop and ask.

5. **Interview** the user (skip what's obvious from the spec or the surrounding codebase):
   - Languages, frameworks, versions
   - Storage and external services
   - Test stack and style (TDD, integration-first, …)
   - Quantified perf targets, budgets, constraints
   - High-level approach in one or two paragraphs
   - The 1–3 alternatives that were seriously considered, scored on the criteria that mattered
   - Concrete decisions worth recording as ADRs (`D-001`, `D-002`, …)
   - Project structure — only new or changed paths
   - Risks with likelihood, impact, and mitigation
   - Open questions whose resolution would change the plan

6. **Discipline**:
   - Decisions follow the ADR shape: Status / Context / Decision / Consequences (with `+` positives and `−` negatives).
   - Decisions have stable IDs `D-001`, `D-002`, … forever. Superseded decisions keep status `superseded` and link to the replacement.
   - The architecture sketch (inline SVG) is **required** if the feature has more than one moving part. Keep it small — fewer than ~8 boxes; if you need more, sketch the slice, not the system.
   - Alternatives must include a scored matrix with one row marked `data-winner`. The winner must be the one actually chosen.
   - Do not duplicate the spec. Link to its requirement IDs (`<a href="./spec.html#FR-001">FR-001</a>`) rather than restating them.

7. **Validate**. Re-walk Principles check. Now that the plan is written, does any decision violate a principle you marked OK earlier? If yes, fix the decision or escalate.

## Output style

- Replace every `[PLACEHOLDER]`.
- Decisions favor brevity. A four-line Decision row is better than a paragraph.
- Use `<spec-warning>` for risks the user must accept before implementation; use `<spec-assumption>` for things this plan takes as true.

## After writing

Report the path, the principles version checked against, and propose `/spectastic.tasks` to derive the work list.
