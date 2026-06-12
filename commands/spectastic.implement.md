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
1. A bare task ID matching `T-\d+` — implement that specific task.
2. A Spec ID (e.g. `001-auth`) — implement the next unchecked task in `specs/<id>/tasks.html`.
3. Empty — scan `specs/` for the most recently modified `tasks.html` with unchecked work, and pick the first unchecked task from it.

## Procedure

1. **Locate the tasks file.** Resolve to `specs/<spec-id>/tasks.html`. If you can't unambiguously pick one, list candidates and ask.

2. **Pick the target task.** Read the file. Each task is a `<li>` with an `<input type="checkbox">` and a unique `T-NNN` ID-like label in the visible text. Find the first unchecked task (or the one matching `$ARGUMENTS` if a task ID was given). If the user passed a task ID that's already ticked, report it and pick the next unchecked one with confirmation.

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

7. **Tick the checkbox.** In `tasks.html`, find the task's `<input type="checkbox">` and add the `checked` attribute. Do not delete the task; do not reorder. Other tasks stay untouched.

8. **Verify.** Run the smallest possible verification the task admits — its scoped tests, a smoke check, a build. Report the result in your reply.

## Discipline (non-negotiable)

- **One task per invocation.** If the user wants to drain a phase, they invoke the command in a loop; you do not silently chain.
- **No scope creep.** A task that names `src/auth/session.ts` does not modify `src/auth/middleware.ts`. If you discover a needed change elsewhere, surface it as a follow-up task suggestion; do not silently make it.
- **Tick once.** If the task is partially done at end of invocation, do not tick the checkbox. Report what's done and what's left.
- **No silent test edits.** If you have to modify a test to make it pass, that's a red flag — the test reveals a real failure or the task is wrong. Stop and report.
- **Verify the spec wasn't lying.** If during implementation you discover the spec is inconsistent with the task (e.g. the task references a behavior the requirement doesn't actually capture), stop and recommend a `/spectastic.propose` to fix the spec — do not "fix" it inline.

## Output style

- A short report at the end: which task you implemented, which file(s) you touched, the verification result, and the next unchecked task.
- Don't dump the task content back into chat — point at the file.
- If you stopped without completing, state exactly why and which checkbox is *not* ticked.

## After implementing

Report:
- Task ID + one-line summary
- Files changed
- Verification result
- The next unchecked task (so the user knows what `/spectastic.implement` will do next)

Suggest `/spectastic.implement` again to pick up the next task — or `/spectastic.triage` if verification surfaced a defect.
