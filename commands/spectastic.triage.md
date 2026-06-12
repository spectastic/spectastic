---
description: Triage a defect against an existing spec/plan/principles and append a single triage card to the spec's triage log.
argument-hint: <short failure description, or paste the error / stack>
---

# /spectastic.triage

You are triaging a single defect in a spec-driven project. Output is one HTML triage card appended to `specs/<spec-id>/triage-log.html`. The format is deliberately small (five required fields) so the same author can run this many times a day without ceremony fatigue.

## What the format optimises for

Industry-converged shape (Atlassian Postmortem-Lite, Google SRE-Lite, [ADRs](https://adr.github.io), Y-statement, after-action review): a single card that fits one screen, with conditional deep-dive collapsed behind a `<details>` summary. Reads in under 30 seconds. See `examples/triage-log.html` for the canonical look.

## Inputs

User input (from `$ARGUMENTS`), in two modes:

**Single-item mode** — one short failure description, an error message, a stack trace, or a reference to a failing test. Routes to a per-spec triage log at `specs/<spec-id>/triage-log.html`.

**List-intake mode** — a list of items, newline-separated or in the form `"X, Y, Z"` or `"three things: A; B; C"`. Each item becomes its own `<spec-triage>` card. List output routes to project-root `./inbox.html` (not per-spec), because list items are typically cross-cutting — typos, small UI tweaks, broken anchors, things from "a few items in my head."

Detection heuristic: if the input contains explicit list markers (commas, semicolons, newlines, "and", numbered items, the phrase "things" / "items" / "stuff"), treat as a list. When in doubt, ask the user "single failure or a list of items?" — don't guess.

## Procedure

0. **Detect mode.** If `$ARGUMENTS` is a list (per the heuristic above), enter **list-intake mode**:
   - Skip steps 1–2 (no per-spec context needed for cross-cutting items).
   - For each list item, run an abbreviated walk of steps 3–7: characterise, classify with one of the eight `layer=` values (including `just-do` and `defer`), and write one `<spec-triage>` card. Per-item output is one line: `Item N → layer=X (one-sentence reason)`. The final write appends all cards to `./inbox.html`.
   - Skip the regeneration test for `just-do` and `defer` items — those classifications already encode the size/scope judgment. Run the regen test for items routed to diagnostic layers (`spec`, `plan`, `implementation`, etc.) just as for single-item mode.
   - Skip the deep-dive section by default for list items unless an item explicitly needs cascade/cross-spec/constitutional context.

   Otherwise, continue with single-item mode below.

1. **Locate the spec.** If the user named a Spec ID, use it. Otherwise scan `specs/` for the most recently modified spec or ask one clarifying question. Resolve to `specs/<spec-id>/`.

2. **Locate the triage log.** Either `specs/<spec-id>/triage-log.html` exists, or copy `examples/triage-log.html` to create one (strip the demo cards; keep header, TL;DR, protocol section, change log).

3. **Load context.** Read principles, spec, plan, related specs that share a contract, and only the implementation files implicated by the failure. State explicitly what you read; if you skipped a file you should have read, say so.

4. **Reproduce and characterise.** Capture *Expected*, *Actual*, and one-sentence *Diagnosis* (cause, not symptom).

5. **Apply the regeneration test.** Ask: "Given only the current spec and plan, would another LLM session reproduce this bug?" Result is `pass` (bug would NOT recur — gap is in code) or `fail` (bug WOULD recur — gap is upstream).

6. **Classify the layer.** Pick the *primary* layer that owns the fix — exactly one of:

   *Diagnostic layers (defects):*
   - `spec` — user-visible behavior, NFR, or contract is missing/wrong.
   - `plan` — spec is correct, technical decision violates a constraint or NFR.
   - `implementation` — spec and plan correct, code drifted.
   - `cross-spec` — two specs disagree on a shared contract.
   - `principles` — a project-wide invariant is missing or being violated.
   - `platform` — defect is upstream of every API the project owns; reproduces with vendor's own tools.

   *Routing exits (for list-intake items that aren't classic defects):*
   - `just-do` — small enough that a spec would not change the decision. One file, no public-contract change, revert-safe. Implement immediately via `/spectastic.implement` — no proposal cycle.
   - `defer` — back-burner; doesn't block any active work. The card carries `defer-to=` pointing at a sibling spec ID, `TBD-<topic>`, or `never`.

   If an item could plausibly be `just-do` but you're unsure, ask. The cost of mis-routing a `just-do` (a small piece of work done without ceremony) is bounded; the cost of mis-routing a `spec`-level gap (a hidden requirement leak) is not.

7. **Write the card(s).** Append one `<spec-triage>` block per item inside the appropriate `<spec-triage-log>`:
   - **Single-item / diagnostic layer:** append to the per-spec `specs/<spec-id>/triage-log.html`.
   - **List intake:** append to project-root `inbox.html`. Item IDs are sequential `I-NNN` (scan the file for the highest existing number and increment).
   - **Pasted list with mixed kinds:** route each card to its appropriate file. A list item classified as `spec` goes to the per-spec log; a list item classified as `just-do` goes to `inbox.html`.

   Card shape:

   ```html
   <spec-triage id="T-NNN" layer="<layer>">
     <header>
       <h4>[ONE-LINE_FAILURE_TITLE]</h4>
       <span class="meta">
         <span class="layer-pill">[Layer]</span>
         <span class="regen" data-result="pass|fail">code|upstream|external</span>
       </span>
     </header>

     <p class="headline">Debugging [SYMPTOM], root cause was [LAYER] [DESCRIPTION];
     fixed by [CHANGE]; regeneration [pass|fails][SHORT_REASON].</p>

     <dl>
       <dt>Expected</dt> <dd>[ONE_LINE]</dd>
       <dt>Actual</dt>   <dd>[ONE_LINE]</dd>
       <dt>Diagnosis</dt><dd>[ONE_SENTENCE_CAUSE_with_REQ_ID_LINKS]</dd>
       <dt>Fix</dt>      <dd>[ARTIFACT_PATH + ONE_LINE_PROPOSAL]</dd>
     </dl>

     <!-- If layer=implementation, embed a tight diff. -->
     <spec-diff>
   <del>  [OFFENDING_LINE]</del>
   <ins>  [CORRECTED_LINE]</ins>
     </spec-diff>

     <details>
       <summary>Deep dive — [none required | cascade required | principles]</summary>
       <!-- Fill only if at least one of: cross-spec, principles, scope-deferred, hotfix-now. -->
     </details>
   </spec-triage>
   ```

8. **Fill the deep-dive only if at least one trigger fires:**
   - **Cross-spec contract touched.** Name the shared contract and the other spec.
   - **Principles invariant implicated.** Propose the principle and what would cascade.
   - **Scope-deferred functionality exposed.** Mark as a separate scope question; do **not** silently promote.
   - **Hotfix-before-amendment sequence required.** State the hotfix and the queued upstream change.
   
   If none of these apply, write a one-line summary inside `<details>` ("No cross-spec contract, no invariant, no hotfix needed.") and move on.

9. **ID the card.** Sequential `T-001`, `T-002`, … Scan the existing log for the highest number and increment. Keep IDs stable forever; never reuse.

10. **Append to the change log** at the bottom of the file: `<li><time datetime="YYYY-MM-DD">DD Mon YYYY</time><span>T-NNN added — [one-line summary].</span></li>`.

## Discipline (non-negotiable)

- **Fix at the highest layer that needed to change.** A code-only patch resurfaces on the next regen if the upstream gap is real.
- **Cite real requirement IDs.** Hallucinated IDs are worse than no IDs. If unsure, read the spec to confirm.
- **Never silently expand scope.** If the bug exposes deferred functionality, surface it; don't promote it.
- **No symptom patching.** If the test passes only because you changed the test, that is not a fix.
- **No spec inflation.** An honest implementation drift (typo, off-by-one, unhandled nil) is **not** a spec failure — the regeneration test catches this.

## Output style

- One card per *item*. Single-item mode = one card. List-intake mode = N cards.
- Each card fits one viewport at 1280px wide.
- Deep-dive collapsed by default; reviewer expands only the cards that need attention.
- After writing, tell the user: card ID(s), layer(s), regen result(s) where applicable, and one-line summaries. Do not paste the card content back into chat — point at the file.

## After writing

**Single-item mode:** report the path (`specs/<spec-id>/triage-log.html`), the new T-ID, and whether any cascade is needed (`/spectastic.plan` re-run, `/spectastic.tasks` re-run, etc.).

**List-intake mode:** report `./inbox.html`, a numbered list of the items written, and how many landed in each routing exit. Suggest `/spectastic.implement` next if any `just-do` items were added. Example:

```
Wrote 4 cards to ./inbox.html:
  I-005 → just-do      typo on principles.html line 42
  I-006 → just-do      broken anchor in CLAUDE.md
  I-007 → defer        dark-mode polish (defer-to=TBD-theme-pass)
  I-008 → spec         add export-to-PDF (needs its own spec)

3 just-do items queued. Run /spectastic.implement to take the first.
```
