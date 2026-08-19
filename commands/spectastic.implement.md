---
description: Implement the next unchecked task from tasks.html (or an inbox just-do card) — read context, do the work, tick the box; loop to drain. Use when building the next task, working through tasks.html, or draining just-do items — not producing the task list (/spectastic.tasks) or changing a spec's contract (/spectastic.propose).
argument-hint: [<T-NNN> | spec-id, defaults to next unchecked task in the most recent spec]
triggers:
  - "implement the next task"
  - "do the next unchecked task"
  - "drain the task list"
  - "work through tasks.html"
  - "tick off the next item"
  - "build the next just-do card"
use-when: "Executing the next unchecked task (or an inbox just-do card) — read context, do the work, tick the box; loop to drain."
sibling-boundary: "Not tasks (which produces the list this consumes); not propose (a contract change, not executing tasks that already exist)."
model: sonnet
---

# /spectastic.implement

You are implementing tasks from a project's `tasks.html`. Given a spec, the default is to **drain the queue** — take the next unchecked task, do it, tick it, repeat — stopping on the first failure. Given an explicit `T-NNN`, you do that one task. The default behaviour picks the most recently modified spec. You can also pass a specific task ID (`T-NNN`) to target one, or a Spec ID to pick the next unchecked task from that spec.

## Why this verb exists

Before this command, implementation was implicit: "Claude Code is the engine, just ask it." That's defensible but unnamed — the lifecycle reads `principles → spec → design → tasks → ?? → propose → apply → triage` with a hole where the actual work happens. `/spectastic.implement` fills the hole. Draining is the default for a spec; a checkbox ticks when each task is done. Stop on the first failure rather than pressing on — the interruption is worth keeping exactly where it earns its keep, which is the trade 090 REQ-TOOL-003 records. `--single` does one task and stops, which is what the old default did.

## Inputs

User input (from `$ARGUMENTS`), in order of precedence:
1. A bare task ID matching `T-\d+` — implement that specific task from a `tasks.html`.
2. A bare inbox card ID matching `I-\d+` — implement that specific `<spec-triage layer="just-do">` card from `inbox.html`.
3. A Spec ID (e.g. `001-auth`) — implement the next unchecked task in `specs/<id>/tasks.html`.
4. Empty — drain order:
   a. Project-root `inbox.html`: pick the oldest `<spec-triage layer="just-do">` card *without* `data-status="done"`.
   b. If no `just-do` cards remain, fall back to the most recently modified `tasks.html` with unchecked work and pick the first unchecked task. **Discovery covers every `tasks.html` tracker.** `specs/**/tasks.html` now sweeps the meta-spec's own execution-only tracker (`specs/000-spectastic/tasks.html`) along with every other slice; the only tracker outside that glob is the root-level `principles-tasks.html` folded by `/spectastic.apply` (per `REQ-CHANGE-006`).

### Drain modes (opt-in)

Per `REQ-TOOL-003` of the meta-spec, three flags extend an invocation into a drain. Default scope is the most-recent `tasks.html`; pass a spec ID before the flag to override (`/spectastic.implement 001-cli --all`).

- `--all` — drain every unchecked task in the resolved scope, in document order. Pause on first failure.
- `--phase=<id>` — drain every unchecked task inside the named phase only. `<id>` is the short form: one of `setup`, `foundation`, `us1`, `us2`, `us3`, `polish`. Resolution prefixes the value with `phase-` and matches the `<section id="phase-…">` in the target `tasks.html` (e.g. `--phase=us1` → `<section id="phase-us1">`).
- `--parallel` — within the resolved scope (one task / phase / all), spawn one `spectastic-impl-task` Agent (`subagent_type: spectastic-impl-task`, Sonnet-pinned per spec 044 US3) per `[P]`-marked task; run non-`[P]` tasks in the main session. Combinable with `--all` or `--phase`. On its own, restricted to the next unchecked task — there is nothing to fan out.
- `--model <tier>` — the escape hatch (spec 044 FR-003). This command runs on Sonnet (its frontmatter `model:`), which a body flag can't change mid-turn — so `--model opus` (or any legal tier: `opus`/`sonnet`/`haiku`) delegates the task's code authoring to the `spectastic-impl-task` Agent pinned *per invocation* to that tier, while the Sonnet main loop orchestrates (context read, checkbox tick, the status-flip AskUserQuestion). Without the flag, authoring is inline on Sonnet.

Flags can appear in any order in `$ARGUMENTS`. A non-flag token (`T-NNN`, `I-NNN`, or a spec ID) selects the scope; flags refine how it's drained. `T-NNN` and `I-NNN` are single-task identifiers and ignore drain flags — drain only makes sense for a multi-task scope.

## Procedure

1. **Locate the target.** Two sources, in order:

   **A. Inbox `just-do` card** (if `$ARGUMENTS` is `I-NNN`, or empty and `inbox.html` exists with an unfinished `just-do` card):
   - Open `./inbox.html`.
   - For `I-NNN`: find the matching `<spec-triage>`. Confirm it has `layer="just-do"` and not `data-status="done"`. If it has `data-status="done"` already, report and ask for the next ID.
   - For empty arg: scan all `<spec-triage layer="just-do">` cards in document order; pick the first one *without* `data-status="done"`.
   - Read the card's `<dl>` for the `Target` field — that's the file or directory the work touches.

   **B. Tasks file** (if `$ARGUMENTS` is `T-NNN`, a spec ID, or empty with no inbox cards):
   - Resolve to `specs/<spec-id>/tasks.html` (the meta-spec resolves normally, to `specs/000-spectastic/tasks.html`) — or, for the tasks-less `principles` target, its execution-only tracker `principles-tasks.html`. If you can't unambiguously pick one, list candidates and ask.

2. **Pick the target task.** Each task is a `<li>` with an `<input type="checkbox">` and a unique `T-NNN` ID-like label in the visible text. Find the first unchecked task (or the one matching `$ARGUMENTS` if a task ID was given).

   **Skip any `<spec-task data-status="superseded">`.** Its box is *closed*, so the ordinary first-unchecked scan will not reach it — but keep this skip anyway: the kernel's own `FIRST_UNCHECKED` pattern admits a `data-status` attribute, so this line is the only thing standing between an unclosed retired task and the drain building work somebody deliberately retired. It is *not owed*: a later change reversed or relocated the decision behind it (`REQ-CHANGE-010`). The `<p class="retired">` inside names the change that retired it. An unchecked-and-superseded task is the one case where an unticked box does **not** mean work is owed, which is exactly why it carries a marker rather than being left to read as ordinary backlog. If the user passed a task ID that's already ticked, report it and pick the next unchecked one with confirmation.

   For inbox `just-do` cards: skip this step; the card itself *is* the unit of work. The card's `Target` field is the scope; its title and headline are the spec.

3. **Estimability gate.** Before doing anything else, check the spec and design for blockers:
   - Any `<spec-question>` still open inside the task's section
   - Any `[NEEDS CLARIFICATION]` marker referenced by the task
   - Missing `defer-to=` on any `<spec-out-of-scope>` item the task touches
   If any block, stop and report.

4. **Load context.** Read:
   - `specs/<spec-id>/spec.html` — the feature's requirements and success criteria (or principles section)
   - `specs/<spec-id>/design.html` — the technical approach for this feature
   - The principles document at `./principles.html` if present
   - Any source files the task explicitly names

5. **Verify the task is well-scoped.** A spectastic task should name a concrete file or directory (per `commands/spectastic.tasks.md`). If the task is vague ("polish the UI"), report that as the blocker — vague tasks aren't ready for implementation.

5b. **Establish the work isn't already done** (`REQ-LIFECYCLE-012`). Before writing anything, search for the *capability* the task asks for — across the project, not only in the files the task names. A task that names the wrong file produces a clean search and a confident wrong conclusion, and a clean search reads like proof. Record what you searched in your report whether or not you find anything; the search that finds nothing is the one that precedes a duplicate. This happened: a complete duplicate archive reader was written because three readers each searched the directory a card named, and the code was one directory over. Skipping this step needs a reason, written down.

6. **Do the work.** Implement the task using your normal Claude Code capabilities. Write tests first if the task is in a "Tests" phase. Stay scoped — do not drift into adjacent tasks, do not refactor surrounding code unless the task explicitly asks for it.

7. **Mark complete.**
   - **Tasks file:** find the task's `<input type="checkbox">` and add the `checked` attribute. Do not delete the task; do not reorder. Other tasks stay untouched.
   - **Inbox `just-do` card:** add `data-status="done"` to the `<spec-triage>` element. Do not remove the card or move it out of inbox.html — it stays as history (faded with a DONE pill). Other cards stay untouched.

8. **Last-tick status transition (per REQ-LIFECYCLE-004 + REQ-LIFECYCLE-005 of the meta-spec).** After **every** tick taken while the spec's status is `Draft`, count the remaining unchecked `<input type="checkbox">` elements in the tasks.html file. **No exclusion is needed:** a retired task is *closed* (`REQ-CHANGE-010`), so an unchecked box means exactly "open". Note what the count now measures — **settlement, not completion**: a spec can reach zero because its remaining work was retired rather than done, and the flip prompt should say so where that is the case, since accepting a spec whose last tasks were withdrawn is a different act from accepting one that finished them. **Skip this step entirely** when the spec's status is already past `Draft` (Accepted / In Review / Superseded / Deprecated / Blocked) — a re-tick or hotfix re-tick on an already-flipped artifact does not re-fire the bundled flip prompt. If status *is* `Draft` and the remaining-unchecked count is exactly zero, surface a Draft → Accepted bundled flip prompt:
   - Display an explicit confirmation prompt naming the spec, the proposed transition (`Draft` → `Accepted`), the trigger ("zero remaining unchecked checkboxes"), and the **three sibling artifacts that will flip together** (spec.html, design.html, tasks.html — the spec slice's bundle, per REQ-LIFECYCLE-005). Use AskUserQuestion or an equivalent explicit-confirmation gesture — never an inline "do you want to" sentence the user can scroll past.
   - The prompt **MUST** remind the author to verify the integration tests covering the spec's Success Criteria pass before confirming. This is the test-pass discipline, absorbed into the confirmation gesture: the author's "yes" attests that tests are green.
   - The command **MUST NOT** auto-flip status. No confirmation, no flip.
   - On confirmation, edit the `<spec-status value="…">` pill in **all three** sibling artifacts (`spec.html`, `design.html`, `tasks.html`) from `draft` to `accepted`, AND append a matching one-line `<spec-changelog>` entry to **each** naming the old state, new state, date, and triggering condition. Example entry: `Status flipped Draft → Accepted on 16 Jun 2026 — zero remaining unchecked tasks; tests verified passing per author confirmation. Sibling bundle (REQ-LIFECYCLE-005).` All three writes are part of the single confirmation gesture — partial bundle flips are forbidden.
   - **When the count is not zero, say what is outstanding** (`REQ-LIFECYCLE-011`). Never fall silent: name the remaining tasks, and flag any that are waiting on a person rather than on work. A slice whose only remaining task needs a human gesture looks identical to one that is half-built, and the status flip and the verify view both stall on it with nothing explaining why.
   - If the user declines (or interrupts the prompt), leave all three statuses as-is and report. The flip can be performed manually later; the requirement is on the prompt, not on the outcome.
   - This step is also **skipped** when the artifact has no tasks.html (principles, meta-spec, triage log, inbox — handled by the tasks-less-artifact clause of REQ-LIFECYCLE-004; author affirms separately, no bundle).

9. **Verify.** Run the smallest possible verification the task admits — its scoped tests, a smoke check, a build. Report the result in your reply.

9b. **Close any triage card this resolved (`REQ-CHANGE-009`).** If the work you just landed is the fix a `<spec-triage>` card called for — the task cites a `T-NNN`, or the card's `Fix` field names the file you touched — mark the card **now**, while you can still evidence it: add `data-status="done"` to the `<spec-triage>` element and a `<dt>Fixed</dt>` row recording what actually shipped. Leave `Fix` as proposed; the divergence between what was planned and what shipped is usually the most informative line on the card. An unmarked card means work is still owed, so a fix that lands without closing its card leaves a false backlog behind — the failure `REQ-CHANGE-009` exists to stop.

10. **Materialise `verify.html` on completion (per spec `021-verify-view`, FR-005).** When this tick brings the spec's tasks.html to **zero remaining unchecked** (the same completion condition as step 8) and the artifact is a real spec bundle (it has a `spec.html` + `tasks.html`), materialise the spec's `verify.html` from the run you actually performed.

    **Below-floor guard, first.** The `verify-view-missing` schema rule enforces a *convention floor*: the lowest spec id in the validated corpus that already carries a `verify.html` (every terminal-state spec at or above that floor is expected to have one; specs below it predate the convention and are exempt). Before writing a **brand-new** `verify.html` for a spec that doesn't already have one, check whether this spec's leading number is *below* every existing `specs/*/verify.html`'s number. If it is, **skip materialisation** — writing one would retroactively lower the floor and turn every terminal-state spec between the old and new floor into a fresh `verify-view-missing` error for a gap that was never expected of them. (This bit a real drain: `012-core-plan`, below spec `021`'s floor, got a stray `verify.html` that orphaned `013`/`014`/`015`/`020` until a corpus-wide `validate` caught it and it was reverted — see `inbox.html` I-041.) Refreshing an *existing* `verify.html` never changes the floor and needs no check.

    Build a JSON object of the commands you genuinely executed across the spec's verification — `{ "run": "<build/start cmd>", "toggle": "<flag/env/setting — omit where the feature has none>", "exercise": "<the entry point that exercises the feature>", "tests": "<the exact test command>", "testsCite": ["T-NNN", …], "demo": "<the human click-path / import / request>", "demoCite": ["SC-NNN", …] }` — and pipe it to the generator:
    ```bash
    echo '<that JSON>' | spectastic verify <spec-id>
    ```
    **`exercise` is the entry point that makes this feature do something**, and it is not the same as `run`. For a library or a CLI, `run` is almost always a *build* — so the command a reader actually wants (`spectastic owner "…"`) belongs in `exercise`. Where `run` already serves the feature (a web app), `exercise` holds the address that reaches it (`open http://localhost:3000/settings`), never a duplicate of the server command. **Omit it rather than invent it** when the work genuinely has no entry point — a schema rule, a CI workflow, a docs change — and it will render as a loud gap, which is the honest result.

    The Run/Tests fields **MUST** be commands you actually ran (grounded evidence, not aspirational — SC-003); omit any field you have no real value for (it renders as a loud "not recorded", never a silent blank). This writes/refreshes `specs/<spec-id>/verify.html`; commit it with the bundle. As a final safety net regardless of the floor check, run `spectastic validate` (or at least re-check for `verify-view-missing` findings) across the corpus afterward — if it introduces any new finding, revert the write. Skip for tasks-less artifacts (principles, triage logs, inbox) and for any non-final tick.

## Discipline (non-negotiable)

- **One task per invocation by default.** Drain modes (`--all`, `--phase=<id>`, `--parallel`) are explicit opt-ins; they relax this default only when the user types the flag. In drain mode you still do not silently chain past failure — the first failing task pauses the drain and requires explicit re-invocation. Report progress per task (one line per ticked checkbox) so the user sees the work as it lands.
- **No scope creep.** A task that names `src/auth/session.ts` does not modify `src/auth/middleware.ts`. If you discover a needed change elsewhere, surface it as a follow-up task suggestion; do not silently make it.
- **Tick once.** If the task is partially done at end of invocation, do not tick the checkbox. Report what's done and what's left.
- **No silent test edits.** If you have to modify a test to make it pass, that's a red flag — the test reveals a real failure or the task is wrong. Stop and report.
- **Verify the spec wasn't lying.** If during implementation you discover the spec is inconsistent with the task (e.g. the task references a behavior the requirement doesn't actually capture), stop and recommend a `/spectastic.propose` to fix the spec — do not "fix" it inline.

## Parallel strategy

`--parallel` partitions the resolved scope by the `[P]` marker on each task. Tasks marked `[P]` are independent of every other in-flight task; tasks without `[P]` have at least one ordering dependency.

- **`[P]` tasks** fork to one `spectastic-impl-task` Agent each (`subagent_type: spectastic-impl-task`, Sonnet-pinned). Launch every agent in a phase together — invoke multiple Agent calls in a single message so they run concurrently. Each agent receives the spec, design, the task's description, and any source files the task names. The agent reports completion as a structured summary. When `--model <tier>` is set, pin the fanned agents to that tier per invocation.
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

## Optional: CLI dispatch

Per 006 FR-009: for deterministic dispatch outside Claude Code (CI scripts, raw shell automation), the LLM MAY invoke `spectastic implement` via Bash. This bypasses LLM-driven file handling and routes through `@spectastic/core/commands/implement` directly. The markdown procedure above remains canonical; the CLI is an alternate code path.

The CLI requires `ANTHROPIC_API_KEY` in the environment for AI-coupled verbs; the slash-command path uses the in-host Claude session and needs no key.
