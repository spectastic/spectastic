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

   **Adjust asset paths on copy.** The template's `<link>` and `<script>` use `../assets/spec.css` (one level up — correct for in-place preview from `templates/`). The destination is two levels deep (`specs/<spec-id>/`), so on copy rewrite `../assets/` → `../../assets/` for both the stylesheet and the script.

3. **Generate tasks** in five phases:

   - **Phase 1 — Setup** (`T-001`, `T-002`, …): repo wiring, dependency install, scaffolding, CI bootstrapping. Most are `[P]`-parallelizable.
   - **Phase 2 — Foundational** (`T-010`+): shared infrastructure no story can ship without — schema, base middleware, shared types, contract test harness. Order where order matters.
   - **Phase 3 — User stories** (`T-1NN` for US1, `T-2NN` for US2, `T-3NN` for US3):
     - Each story opens with **test tasks** (`T-100`, `T-101`, …) that must be written and **failing** before any implementation task starts.
     - Then implementation tasks (`T-110`, `T-111`, …).
     - Each story closes a specific subset of requirements. Add a `<spec-note>` at the end of the story listing closed `FR-NNN` and `SC-NNN` with anchor links.
   - **Phase 4 — Polish** (`T-900`+): docs, perf, observability, cleanup. Often `[P]`.

4. **Task discipline**:
   - Each task is a `<spec-task>` element (per `REQ-LIFECYCLE-003` of the meta-spec) with `id="T-NNN"`, the boolean `parallel` attribute when applicable, and an inner `<input type="checkbox">` for completion state. **Never** use `<div class="task">` + class-spans — that form is a `REQ-AUTHOR-001` violation.
   - One task = one **concrete file or directory**. Show the path inline using `<span class="path">src/auth/session.ts</span>`.
   - Mark `parallel` only when the task touches a distinct file and has no dependency on another in-flight task. Omit the attribute otherwise — CSS hides the marker column when absent.
   - Task IDs are stable forever. Completed tasks are not deleted; their inner checkbox gains `checked` and the row strikes through via `:has(input:checked)` in `assets/spec.css`.

   Example task entry:

   ```html
   <spec-task id="T-001" parallel>
     <input type="checkbox">
     <div><strong>Implement session expiry middleware</strong> <span class="path">src/auth/session.ts</span></div>
   </spec-task>
   ```

5. **Story → requirement traceability**. Every `FR-NNN` in the spec must be referenced by at least one task. Every `SC-NNN` must be measurable by at least one task's outcome. If a requirement has no task, flag it in a `<spec-warning>` rather than silently dropping it.

6. **Execution strategy**. Pick the tab in §1 that best fits the project — MVP-first for solo work or risky discovery; Incremental for normal team work; Parallel teams when staffing allows.

## Output style

- Replace every `[PLACEHOLDER]`.
- Task descriptions are imperative: "Implement session expiry middleware", not "Session expiry middleware should be implemented".
- Keep individual tasks small enough that one engineer can finish one in a single sitting. Split anything longer.

## After writing

Report the path, total task count, and the count of `[P]`-parallel tasks. Suggest the user open the file in a browser and start ticking boxes.
