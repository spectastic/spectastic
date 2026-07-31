---
description: Derive the task breakdown from a spec + design — an ordered, parallelizable, test-first task list. Use when turning a spec and design into the executable checklist that /spectastic.implement drains — not the architecture (/spectastic.design) or the execution itself (/spectastic.implement).
argument-hint: [spec-id, defaults to most recent]
triggers:
  - "break the spec into tasks"
  - "derive the task list"
  - "generate an ordered task breakdown"
  - "what tasks implement this spec"
  - "test-first task breakdown"
use-when: "Deriving an ordered, parallelizable, test-first task list from an existing spec + design — the executable breakdown implement drains."
sibling-boundary: "Not design (architecture and decisions, not the task list); not implement (which executes the tasks this produces)."
model: sonnet
---

# /spectastic.tasks

You are deriving a **task breakdown** from an existing spec and design. Output is a single-file HTML artifact at `specs/<spec-id>/tasks.html`.

## Inputs

User input (from `$ARGUMENTS`): a Spec ID such as `001-auth-service`, or empty (defaults to most recently modified).

## Procedure

1. **Locate inputs**: `specs/<spec-id>/spec.html` and `specs/<spec-id>/design.html`. Read both end-to-end before generating tasks. You need every requirement, success criterion, and decision in working memory.

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
   - **Emphasis is a short title, not the whole line** (per `REQ-LIFECYCLE-003`). The leading `<strong>` wraps a short imperative *task title only*; any supplementary detail follows in **plain-weight prose**, conventionally after an em-dash. Bolding the entire detailed sentence turns the task list into a wall of bold with no title/detail contrast — the `task-title-bold-scope` validate rule warns when it sees it.
   - One task = one **concrete file or directory**. Show the path inline using a trailing `<span class="path">src/auth/session.ts</span>` (`path` is an exempt layout class, not a component).
   - Mark `parallel` only when the task touches a distinct file and has no dependency on another in-flight task. Omit the attribute otherwise — CSS hides the marker column when absent.
   - Task IDs are stable forever. Completed tasks are not deleted; their inner checkbox gains `checked` and the row strikes through via `:has(input:checked)` in `assets/spec.css`.

   Example task entries — a bare title, and a title with plain-weight detail after the em-dash (the `<strong>` stays on the title in both):

   ```html
   <spec-task id="T-001" parallel>
     <input type="checkbox">
     <div><strong>Implement session expiry middleware</strong> <span class="path">src/auth/session.ts</span></div>
   </spec-task>
   <spec-task id="T-002">
     <input type="checkbox">
     <div><strong>Add the refresh-token rotation guard</strong> — reject a reused token and revoke its family; return 401 with a <code>token_reuse</code> code. <span class="path">src/auth/refresh.ts</span></div>
   </spec-task>
   ```

5. **Story → requirement traceability**. Every `FR-NNN` in the spec must be referenced by at least one task. Every `SC-NNN` must be measurable by at least one task's outcome. If a requirement has no task, flag it in a `<spec-warning>` rather than silently dropping it.

6. **Execution strategy**. Pick the tab in §1 that best fits the project — MVP-first for solo work or risky discovery; Incremental for normal team work; Parallel teams when staffing allows.

## Restore mode (`--restore`)

When a spec graduated from an exploration (via `explore --graduate`, 023), `--restore` derives **path-appropriate restore tasks** from the frozen classification in the archived marker `explorations/archive/<id>/quarantine.json` instead of a normal breakdown.

The trigger is explicit, never silent (SC-001): the flag forces restore; without it, a detected graduated marker prompts on a TTY (restore vs. normal breakdown) and refuses-with-a-hint when piped or in CI (non-TTY) rather than guess the shape.

Two paths by classification:

- **`tracer-bullet`** → a refactor-to-comply list: bring the kept build up to the spec and reinstate the gates relaxed during explore — requirement IDs, INVEST, full principles, and the estimability + grounding gates.
- **`spike`** → a clean-rebuild, test-first flow, including a task that **deletes** the discarded prototype at `explorations/archive/<id>/`. Mark it for the explorer to run; never auto-delete.

The generated `tasks.html` carries a visible banner naming the classification and the source archive. CLI form: `spectastic tasks <id> --restore` (AI-coupled, like normal tasks).

## Output style

- Replace every `[PLACEHOLDER]`.
- Task descriptions are imperative: "Implement session expiry middleware", not "Session expiry middleware should be implemented".
- Keep individual tasks small enough that one engineer can finish one in a single sitting. Split anything longer.

## After writing

Report the path, total task count, and the count of `[P]`-parallel tasks. Suggest the user open the file in a browser and start ticking boxes.

## Optional: CLI dispatch

Per 006 FR-009: for deterministic dispatch outside Claude Code (CI scripts, raw shell automation), the LLM MAY invoke `spectastic tasks` via Bash. This bypasses LLM-driven file handling and routes through `@spectastic/core/commands/tasks` directly. The markdown procedure above remains canonical; the CLI is an alternate code path.

The CLI requires `ANTHROPIC_API_KEY` in the environment for AI-coupled verbs; the slash-command path uses the in-host Claude session and needs no key.
