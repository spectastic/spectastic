---
description: Implement the next unchecked task from tasks.html — read context, do the work, tick the box.
argument-hint: [<T-NNN> | spec-id, defaults to next unchecked task in the most recent spec]
---

# /spectastic.implement

You are implementing **one task** from a project's `tasks.html`. The default behaviour picks the next unchecked task in the most recently modified spec. You can also pass a specific task ID (`T-NNN`) to target one, or a Spec ID to pick the next unchecked task from that spec.

## Why this verb exists

Before this command, implementation was implicit: "Claude Code is the engine, just ask it." That's defensible but unnamed — the lifecycle reads `principles → spec → plan → tasks → ?? → propose → apply → triage` with a hole where the actual work happens. `/spectastic.implement` fills the hole. One task per invocation; checkbox ticks when the task is done; loop the command to drain a spec.

## Inputs

User input (from `$ARGUMENTS`), in order of precedence:
1. A bare task ID matching `T-\d+` — implement that specific task from a `tasks.html`.
2. A bare inbox card ID matching `I-\d+` — implement that specific `<spec-triage layer="just-do">` card from `inbox.html`.
3. A Spec ID (e.g. `001-auth`) — implement the next unchecked task in `specs/<id>/tasks.html`.
4. Empty — drain order:
   a. Project-root `inbox.html`: pick the oldest `<spec-triage layer="just-do">` card *without* `data-status="done"`.
   b. If no `just-do` cards remain, fall back to the most recently modified `tasks.html` with unchecked work and pick the first unchecked task.

### Drain modes (opt-in)

Per `REQ-TOOL-003` of the meta-spec, three flags extend an invocation into a drain. Default scope is the most-recent `tasks.html`; pass a spec ID before the flag to override (`/spectastic.implement 001-cli --all`).

- `--all` — drain every unchecked task in the resolved scope, in document order. Pause on first failure.
- `--phase=<id>` — drain every unchecked task inside the named phase only. `<id>` is the short form: one of `setup`, `foundation`, `us1`, `us2`, `us3`, `polish`. Resolution prefixes the value with `phase-` and matches the `<section id="phase-…">` in the target `tasks.html` (e.g. `--phase=us1` → `<section id="phase-us1">`).
- `--parallel` — within the resolved scope (one task / phase / all), spawn one `Agent` tool call per `[P]`-marked task; run non-`[P]` tasks in the main session. Combinable with `--all` or `--phase`. On its own, restricted to the next unchecked task — there is nothing to fan out.

Flags can appear in any order in `$ARGUMENTS`. A non-flag token (`T-NNN`, `I-NNN`, or a spec ID) selects the scope; flags refine how it's drained. `T-NNN` and `I-NNN` are single-task identifiers and ignore drain flags — drain only makes sense for a multi-task scope.

## Procedure

1. **Locate the target.** Two sources, in order:

   **A. Inbox `just-do` card** (if `$ARGUMENTS` is `I-NNN`, or empty and `inbox.html` exists with an unfinished `just-do` card):
   - Open `./inbox.html`.
   - For `I-NNN`: find the matching `<spec-triage>`. Confirm it has `layer="just-do"` and not `data-status="done"`. If it has `data-status="done"` already, report and ask for the next ID.
   - For empty arg: scan all `<spec-triage layer="just-do">` cards in document order; pick the first one *without* `data-status="done"`.
   - Read the card's `<dl>` for the `Target` field — that's the file or directory the work touches.

   **B. Tasks file** (if `$ARGUMENTS` is `T-NNN`, a spec ID, or empty with no inbox cards):
   - Resolve to `specs/<spec-id>/tasks.html`. If you can't unambiguously pick one, list candidates and ask.

2. **Pick the target task.** Each task is a `<li>` with an `<input type="checkbox">` and a unique `T-NNN` ID-like label in the visible text. Find the first unchecked task (or the one matching `$ARGUMENTS` if a task ID was given). If the user passed a task ID that's already ticked, report it and pick the next unchecked one with confirmation.

   For inbox `just-do` cards: skip this step; the card itself *is* the unit of work. The card's `Target` field is the scope; its title and headline are the spec.

3. **Estimability gate.** Before doing anything else, check the spec and plan for blockers:
   - Any `<spec-question>` still open inside the task's section
   - Any `[NEEDS CLARIFICATION]` marker referenced by the task
   - Missing `defer-to=` on any `<spec-out-of-scope>` item the task touches
   If any block, stop and report.

4. **Load context.** Read:
   - `specs/<spec-id>/spec.html` — the feature's requirements and success criteria (or principles section)
   - `specs/<spec-id>/plan.html` — the technical approach for this feature
   - The principles document at `./principles.html` if present
   - Any source files the task explicitly names

5. **Verify the task is well-scoped.** A spectastic task should name a concrete file or directory (per `commands/spectastic.tasks.md`). If the task is vague ("polish the UI"), report that as the blocker — vague tasks aren't ready for implementation.

6. **Do the work.** Implement the task using your normal Claude Code capabilities. Write tests first if the task is in a "Tests" phase. Stay scoped — do not drift into adjacent tasks, do not refactor surrounding code unless the task explicitly asks for it.

7. **Mark complete.**
   - **Tasks file:** find the task's `<input type="checkbox">` and add the `checked` attribute. Do not delete the task; do not reorder. Other tasks stay untouched.
   - **Inbox `just-do` card:** add `data-status="done"` to the `<spec-triage>` element. Do not remove the card or move it out of inbox.html — it stays as history (faded with a DONE pill). Other cards stay untouched.

8. **Verify.** Run the smallest possible verification the task admits — its scoped tests, a smoke check, a build. Report the result in your reply.

## Discipline (non-negotiable)

- **One task per invocation by default.** Drain modes (`--all`, `--phase=<id>`, `--parallel`) are explicit opt-ins; they relax this default only when the user types the flag. In drain mode you still do not silently chain past failure — the first failing task pauses the drain and requires explicit re-invocation. Report progress per task (one line per ticked checkbox) so the user sees the work as it lands.
- **No scope creep.** A task that names `src/auth/session.ts` does not modify `src/auth/middleware.ts`. If you discover a needed change elsewhere, surface it as a follow-up task suggestion; do not silently make it.
- **Tick once.** If the task is partially done at end of invocation, do not tick the checkbox. Report what's done and what's left.
- **No silent test edits.** If you have to modify a test to make it pass, that's a red flag — the test reveals a real failure or the task is wrong. Stop and report.
- **Verify the spec wasn't lying.** If during implementation you discover the spec is inconsistent with the task (e.g. the task references a behavior the requirement doesn't actually capture), stop and recommend a `/spectastic.propose` to fix the spec — do not "fix" it inline.

## Parallel strategy

`--parallel` partitions the resolved scope by the `[P]` marker on each task. Tasks marked `[P]` are independent of every other in-flight task; tasks without `[P]` have at least one ordering dependency.

- **`[P]` tasks** fork to one `Agent` tool call each. Launch every agent in a phase together — invoke multiple `Agent` tool calls in a single message so they run concurrently. Each agent receives the spec, plan, the task's description, and any source files the task names. The agent reports completion as a structured summary.
- **Non-`[P]` tasks** run in the main session, sequentially, in document order. They block on each other but not on in-flight `[P]` agents.

The main session collects each agent's result and ticks the task's checkbox only after the agent reports success. A failed agent pauses the drain at that task — no fan-out continues past the failure, and the user re-invokes after fixing.

## Output style

- A short report at the end: which task you implemented, which file(s) you touched, the verification result, and the next unchecked task.
- Don't dump the task content back into chat — point at the file.
- If you stopped without completing, state exactly why and which checkbox is *not* ticked.

## After implementing

Report:
- Task or inbox card ID + one-line summary
- Files changed
- Verification result
- The next unfinished item — the next `just-do` card in inbox.html, or if inbox is drained, the next unchecked task in the active spec.

Suggest `/spectastic.implement` again to pick up the next item — or `/spectastic.triage` if verification surfaced a defect or new follow-up items.
