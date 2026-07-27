---
description: Author a change proposal for an existing spec — intent, scope, typed deltas, tasks; one PR-shaped file per change. Use when changing an already-written spec: adding, modifying, or removing a requirement — not a brand-new feature (/spectastic.spec), landing an approved proposal (/spectastic.apply), or classifying a defect first (/spectastic.triage).
argument-hint: <change name or one-line description>
triggers:
  - "propose a change to a spec"
  - "author a change proposal"
  - "add, modify, or remove a requirement"
  - "change an existing spec"
  - "PR-shaped spec change"
use-when: "Changing an already-written spec — intent, scope, typed deltas, and a scoped task list — one PR-shaped proposal per change."
sibling-boundary: "Not spec (a brand-new feature, not a change to an existing one); not apply (which lands an approved proposal); not triage (which classifies a defect before a proposal is even warranted)."
model: inherit
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

6. **Two-phase interview.** Discovery in chat (narrative), decisions via `AskUserQuestion` (bounded choice). The proposal's `<spec-questions>` register should be empty by write-time unless something is genuinely undecidable today. Represent zero per `REQ-AUTHOR-005`: no `<li>` in the register (a `<p>` rationale is fine), never a "None" `<li>` — each `<li>` reads as one open question to consumers.

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

8. **Adversarial risk pass.** Before the splitting nudge runs, decide whether the proposal needs an adversarial risk pass per `REQ-CHANGE-004` of the meta-spec.

   **Heuristic — run the pass if any of:**
   - The proposal touches a `priority="must"` requirement (target ID resolves to `must` in the live spec, OR an ADD/MODIFY post-state declares `priority="must"`).
   - The proposal has any `op="removed"` delta.
   - The proposal touches **two or more** distinct topic prefixes (e.g. `REQ-AUTH-*` and `REQ-LIFECYCLE-*`).

   The splitting-nudge at step 9 catches multi-delta scope; **do not** stack `>1 delta` on top of this heuristic — it would fire on nearly every proposal and train `--no-adversarial` muscle memory.

   **Flag overrides:** `--no-adversarial` skips even when the heuristic fires; `--adversarial` runs even when it doesn't.

   **Spawn the critic Agent** — via the Agent tool with `subagent_type: spectastic-critic`, so it runs on the model that definition pins (`inherit` — the session model; adversarial risk-finding is the one fan-out kept on the strong model, spec 044 US3). Inputs: the drafted proposal HTML, the live spec, `./principles.html`, the project's `knowledge/` corpus if present (055-corpus-in-review), and (if known) the originating inbox card path. Use this prompt verbatim:

   > Identify exactly three risks in this proposal:
   > 1. The single change most likely to be regretted in 30 days. Cite the specific `<spec-delta>` target or quote the phrase being objected to.
   > 2. The single requirement in the live spec this proposal most likely contradicts. Cite the REQ ID.
   > 3. The single concern about the proposal's scope — too broad, too narrow, or wrong topic group. Cite the `§Scope` item.
   >
   > If a `knowledge/` corpus exists in this repo, add a fourth risk: a requirement in the live spec that contradicts a domain fact committed under `knowledge/<pack>/references/`. Cite the contradicted `KB-NNNN@edition`. No `knowledge/` directory ⇒ skip this fourth risk entirely.
   >
   > Empty findings are forbidden. If no risk passes the "would I regret this in 30 days?" test for any applicable slot, return `<spec-risk status="no-value-found">` with a one-sentence justification. Three `no-value-found` in a row escalates to the user before archive.

   **Embed the findings** in the proposal's §5 Risk register as one `<spec-risk target="…" status="identified">` per finding. Every `<spec-risk>` MUST carry a `target=` (delta ID, REQ ID, or `§<n>` anchor); missing renders the visible label `MISSING TARGET`.

   **Author response discipline:** the propose-session LLM MAY draft an initial response into `<div class="response">` per risk, BUT the LLM MUST leave `status="identified"`. Status transitions — to `accepted`, `mitigated`, or `rejected` — are the user's commitment, not the LLM's. The user-authored status field is the gate; LLM drafts are starting points.

   **Record the dispositioner (`by=`, per `REQ-CHANGE-004`).** When a `<spec-risk>` status leaves `identified` for `accepted | mitigated | rejected`, the disposition MUST record `by=` on that `<spec-risk>` — the human who dispositioned the finding (`name · handle`, the recording shape the author's choice), never an automated agent. It stays empty while `identified`. This is the source the `Acked-by` trailer reads (spec 027). The propose-session LLM MUST NOT fill `by=` with itself: like the status field, `by=` is the user's commitment. If the user commits a transition in the same session (e.g. via the decision interview), record `by=` naming them; otherwise leave it empty for the user to fill when they disposition.

9. **Budget-aware splitting nudge.** Before finalising the proposal, count the deltas. If the proposal contains **more than ~5 deltas**, or touches deltas across **more than 2 topic prefixes** (e.g. `REQ-AUTH-*` and `REQ-RENDER-*`), stop and ask the user: *"Would these read better as two or three smaller proposals?"* The cost of a small proposal is one extra archive call; the cost of an oversize proposal is review fatigue and merge ambiguity. The default answer is "yes, split" unless the deltas truly share a single intent.

10. **Check for sibling proposals.** Before emitting, scan `specs/<spec-id>/changes/` for other proposal folders whose deltas target any of the same IDs as this one. If found, report them and ask the user how to sequence — concurrent proposals on the same target are the most common archive-time conflict.

11. **Update the proposal's changelog** with today's date and one-line summary of the change
   intent.

## Output style

- Replace every `[PLACEHOLDER]`. Never leave one in the final file.
- Paragraphs short. Reviewers skim proposals more aggressively than specs.
- Use `<spec-note>` for non-obvious approach details; `<spec-warning>` for risks; tasks as a
  simple `<ul>` with checkbox inputs. The §6 task list is the change's implementation breakdown:
  on `/spectastic.apply` it folds into the target's `tasks.html` as a new phase that
  `/spectastic.implement` drains (per `REQ-CHANGE-006`), and the archived proposal §6 becomes the
  frozen intent record. Write each task as one concrete file/dir of work, the way `tasks.html` tasks read.

## After writing

Report: the proposal path, the count and breakdown of deltas (e.g. "2 added, 1 modified,
1 removed"), and the next step — typically the user opens the file in a browser to review
before sharing.

Suggest `/spectastic.apply <date>-<slug>` as the follow-up when the proposal is approved.

## Optional: CLI dispatch

Per 006 FR-009: for deterministic dispatch outside Claude Code (CI scripts, raw shell automation), the LLM MAY invoke `spectastic propose` via Bash. This bypasses LLM-driven file handling and routes through `@spectastic/core/commands/propose` directly. The markdown procedure above remains canonical; the CLI is an alternate code path.

The CLI requires `ANTHROPIC_API_KEY` in the environment for AI-coupled verbs; the slash-command path uses the in-host Claude session and needs no key.
