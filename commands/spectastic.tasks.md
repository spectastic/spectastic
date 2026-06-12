---
description: Derive the task breakdown from a spec + plan — ordered, parallelizable, test-first.
argument-hint: [spec-id, defaults to most recent]
---

# /spectastic.tasks

You are deriving a **task breakdown** from an existing spec and plan. Output is a single-file HTML artifact at `specs/<spec-id>/tasks.html`.

## Inputs

User input (from `$ARGUMENTS`): a Spec ID such as `001-auth-service`, or empty (defaults to most recently modified).

## Procedure

1. **Locate inputs**: `specs/<spec-id>/spec.html` and `specs/<spec-id>/plan.html`. Read both end-to-end before generating tasks. You need every requirement, success criterion, and decision in working memory.

2. **Copy** `templates/tasks.html` to `specs/<spec-id>/tasks.html`.

3. **Generate tasks** in five phases:

   - **Phase 1 — Setup** (`T-001`, `T-002`, …): repo wiring, dependency install, scaffolding, CI bootstrapping. Most are `[P]`-parallelizable.
   - **Phase 2 — Foundational** (`T-010`+): shared infrastructure no story can ship without — schema, base middleware, shared types, contract test harness. Order where order matters.
   - **Phase 3 — User stories** (`T-1NN` for US1, `T-2NN` for US2, `T-3NN` for US3):
     - Each story opens with **test tasks** (`T-100`, `T-101`, …) that must be written and **failing** before any implementation task starts.
     - Then implementation tasks (`T-110`, `T-111`, …).
     - Each story closes a specific subset of requirements. Add a `<spec-note>` at the end of the story listing closed `FR-NNN` and `SC-NNN` with anchor links.
   - **Phase 4 — Polish** (`T-900`+): docs, perf, observability, cleanup. Often `[P]`.

4. **Task discipline**:
   - One task = one **concrete file or directory**. Show the path inline (`src/auth/session.ts`).
   - Mark `[P]` only when the task touches a distinct file and has no dependency on another in-flight task. Otherwise leave the parallelism marker blank (the template uses a `data-p="0"` dot).
   - Task IDs are stable forever. Completed tasks are not deleted; their checkbox is ticked.
   - Use `<input type="checkbox">` for the checkbox — it's editable in the browser via `contenteditable` is not needed; the checkbox state can be persisted if the user wires it up, but is decoration here.

5. **Story → requirement traceability**. Every `FR-NNN` in the spec must be referenced by at least one task. Every `SC-NNN` must be measurable by at least one task's outcome. If a requirement has no task, flag it in a `<spec-warning>` rather than silently dropping it.

6. **Execution strategy**. Pick the tab in §1 that best fits the project — MVP-first for solo work or risky discovery; Incremental for normal team work; Parallel teams when staffing allows.

## Output style

- Replace every `[PLACEHOLDER]`.
- Task descriptions are imperative: "Implement session expiry middleware", not "Session expiry middleware should be implemented".
- Keep individual tasks small enough that one engineer can finish one in a single sitting. Split anything longer.

## After writing

Report the path, total task count, and the count of `[P]`-parallel tasks. Suggest the user open the file in a browser and start ticking boxes.
