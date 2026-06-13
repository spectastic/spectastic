---
description: Author a change proposal for an existing spec — intent, scope, deltas, tasks. One file per change, PR-shaped.
argument-hint: <change name or one-line description>
---

# /spectastic.propose

You are scaffolding a **change proposal** for an existing spec. The proposal is a single
self-contained HTML artifact that captures *what's changing*, *why*, and *which requirements
it touches*. Output lives at `specs/<spec-id>/changes/<YYYY-MM-DD>-<slug>/proposal.html`.

## Why this format

The change-proposal artifact carries three load-bearing decisions:

1. **One file per change.** Intent, scope, approach, deltas, and a scoped task list live in
   named sections of a single `proposal.html` — not spread across separate documents the
   reviewer must stitch together.
2. **Typed deltas, no silent failure.** Every `<spec-delta>` carries an `op` attribute
   matching `added | modified | removed | renamed`, plus a `target=` pointing at the
   requirement ID. Wrong or missing `op` renders the visible label `MISSING OP`. There is no
   loose hash-counting or freeform header parsing to fail silently.
3. **Inline rendered preview.** ADD and MODIFY deltas embed a complete
   `<spec-requirement>` showing the post-state exactly as it'll appear when archived.
   Reviewers see what they're approving without running `git diff`.

Read `examples/proposal.html` once before writing your first proposal.

## Inputs

User input (from `$ARGUMENTS`): a change name or one-line description ("add OAuth login",
"deprecate the deferred CLI requirement").

## Procedure

1. **Locate the spec.** If the user named a Spec ID, use it. Otherwise scan `specs/` for the
   most recently modified spec or ask one clarifying question. Resolve to `specs/<spec-id>/`.

2. **Pick a slug.** Convert the change name to lowercase-kebab-case (≤ 40 chars). Combine
   with today's date: `<YYYY-MM-DD>-<slug>`.

3. **Create the change folder**: `specs/<spec-id>/changes/<date>-<slug>/`.

4. **Copy** `templates/proposal.html` to `specs/<spec-id>/changes/<date>-<slug>/proposal.html`.

   **Adjust asset paths on copy.** The template's `<link>` and `<script>` use `../assets/spec.css` (one level up — correct for in-place preview from `templates/`). The destination is four levels deep, so on copy rewrite `../assets/` → `../../../../assets/` for both the stylesheet and the script. Adjust any link to the parent spec (`<a href="../spec.html">`) similarly: `../../spec.html`.
   Adjust the relative paths to `../../../assets/spec.css` and `../../../assets/spec.js` if
   the template uses different paths.

5. **Skip what's known.** Before any interview, check `$ARGUMENTS`, the live spec, and any sibling proposal folders for context you already have. Don't re-ask. Only interview for what's genuinely missing.

6. **Two-phase interview.** Discovery in chat (narrative), decisions via `AskUserQuestion` (bounded choice). The proposal's `<spec-questions>` register should be empty by write-time unless something is genuinely undecidable today.

   **Chat phase (narrative answers):**
   - **Intent** — why this change, in one or two paragraphs. The reviewer should understand the motivation before reading the deltas.
   - **Approach** — one or two paragraphs. Architectural choices that aren't obvious from the deltas themselves.
   - **In-scope items** — what's explicitly included.

   **Decision phase — use `AskUserQuestion` to anchor each of these before writing:**
   - **Change shape** — Additive (only ADD) / Corrective (MODIFY + REMOVE) / Mixed / Rename-only
   - **Status to ship at** — `proposed` (more review wanted) / `under-review` (ready to share) / `approved` (apply-ready)
   - **For each delta candidate** the chat phase surfaced, ask the **op** explicitly: ADD / MODIFY / REMOVE / RENAME — one question per delta or batched multiSelect for several at once
   - **For each REMOVE** — get both `reason` (one-line) and `migration` (one-line) as separate chat answers (these are free-text, not multiple-choice — use chat). If either is empty, refuse to write the delta.
   - **Out-of-scope items** — for each, ask `defer-to=` target via `AskUserQuestion` with options: a known sibling spec ID / `TBD-<topic>` / `never`

   Rules:
   - ≤4 questions per `AskUserQuestion` call; loop as needed.
   - Use chat (not `AskUserQuestion`) for narrative content: intent paragraphs, requirement bodies, reason/migration text.
   - Don't write the proposal until the decision phase is complete. An unresolved decision becomes a `<spec-question>` only if it genuinely can't be settled now.

7. **Discipline**:
   - Every `<spec-delta>` MUST carry `op` and `target`. Never emit a delta without both.
   - For `op="added"` and `op="modified"`, embed a full `<spec-requirement>` inside the delta
     showing the post-state. The reviewer's eye lands on what they're approving.
   - For `op="removed"`, fill `.reason-block` and `.migration-block` with substantive
     content. "Reason: redundant" is not substantive.
   - **Verify every `target` ID exists** in the live spec for `modified | removed | renamed`,
     and **does not exist** for `added`. Hallucinated IDs are worse than no IDs.
   - Status pill defaults to `proposed`. The user updates it to `under-review` when sharing,
     `approved` when accepted, `applied` after archive, `withdrawn` if abandoned.

8. **Budget-aware splitting nudge.** Before finalising the proposal, count the deltas. If the proposal contains **more than ~5 deltas**, or touches deltas across **more than 2 topic prefixes** (e.g. `REQ-AUTH-*` and `REQ-RENDER-*`), stop and ask the user: *"Would these read better as two or three smaller proposals?"* The cost of a small proposal is one extra archive call; the cost of an oversize proposal is review fatigue and merge ambiguity. The default answer is "yes, split" unless the deltas truly share a single intent.

9. **Check for sibling proposals.** Before emitting, scan `specs/<spec-id>/changes/` for other proposal folders whose deltas target any of the same IDs as this one. If found, report them and ask the user how to sequence — concurrent proposals on the same target are the most common archive-time conflict.

10. **Update the proposal's changelog** with today's date and one-line summary of the change
   intent.

## Output style

- Replace every `[PLACEHOLDER]`. Never leave one in the final file.
- Paragraphs short. Reviewers skim proposals more aggressively than specs.
- Use `<spec-note>` for non-obvious approach details; `<spec-warning>` for risks; tasks as a
  simple `<ul>` with checkbox inputs.

## After writing

Report: the proposal path, the count and breakdown of deltas (e.g. "2 added, 1 modified,
1 removed"), and the next step — typically the user opens the file in a browser to review
before sharing.

Suggest `/spectastic.apply <date>-<slug>` as the follow-up when the proposal is approved.
