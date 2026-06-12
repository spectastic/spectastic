---
description: Triage a defect against an existing spec/plan/principles and append a single triage card to the spec's triage log.
argument-hint: <short failure description, or paste the error / stack>
---

# /spectastic.triage

You are triaging a single defect in a spec-driven project. Output is one HTML triage card appended to `specs/<spec-id>/triage-log.html`. The format is deliberately small (five required fields) so the same author can run this many times a day without ceremony fatigue.

## What the format optimises for

Industry-converged shape (Atlassian Postmortem-Lite, Google SRE-Lite, [ADRs](https://adr.github.io), Y-statement, after-action review): a single card that fits one screen, with conditional deep-dive collapsed behind a `<details>` summary. Reads in under 30 seconds. See `examples/triage-log.html` for the canonical look.

## Inputs

User input (from `$ARGUMENTS`): a short failure description, an error message, a stack trace, or a reference to a failing test.

## Procedure

1. **Locate the spec.** If the user named a Spec ID, use it. Otherwise scan `specs/` for the most recently modified spec or ask one clarifying question. Resolve to `specs/<spec-id>/`.

2. **Locate the triage log.** Either `specs/<spec-id>/triage-log.html` exists, or copy `examples/triage-log.html` to create one (strip the demo cards; keep header, TL;DR, protocol section, change log).

3. **Load context.** Read principles, spec, plan, related specs that share a contract, and only the implementation files implicated by the failure. State explicitly what you read; if you skipped a file you should have read, say so.

4. **Reproduce and characterise.** Capture *Expected*, *Actual*, and one-sentence *Diagnosis* (cause, not symptom).

5. **Apply the regeneration test.** Ask: "Given only the current spec and plan, would another LLM session reproduce this bug?" Result is `pass` (bug would NOT recur — gap is in code) or `fail` (bug WOULD recur — gap is upstream).

6. **Classify the layer.** Pick the *primary* layer that owns the fix — exactly one of:
   - `spec` — user-visible behavior, NFR, or contract is missing/wrong.
   - `plan` — spec is correct, technical decision violates a constraint or NFR.
   - `implementation` — spec and plan correct, code drifted.
   - `cross-spec` — two specs disagree on a shared contract.
   - `principles` — a project-wide invariant is missing or being violated.
   - `platform` — defect is upstream of every API the project owns; reproduces with vendor's own tools.

7. **Write the card.** Append a `<spec-triage>` block inside the `<spec-triage-log>` element using this shape:

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

- One card per invocation. Multiple defects = multiple invocations.
- Card fits one viewport at 1280px wide.
- Deep-dive collapsed by default; reviewer expands only the cards that need attention.
- After writing, tell the user: card ID, layer, regen result, and one-line summary. Do not paste the card content back into chat — point at the file.

## After writing

Report the path, the new T-ID, and whether any cascade is needed (`/spectastic.plan` re-run, `/spectastic.tasks` re-run, etc.).
