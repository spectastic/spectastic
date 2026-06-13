---
description: Apply an approved change proposal — fold deltas into the live spec, move the change folder to archive.
argument-hint: [<date>-<slug>, defaults to most recent approved proposal]
---

# /spectastic.apply

You are applying an **approved change proposal** to the live spec it targets. Output is
threefold:

1. The live `spec.html` is patched — each delta is applied in place.
2. The change folder moves from `specs/<spec-id>/changes/<date>-<slug>/` to
   `specs/<spec-id>/changes/archive/<date>-<slug>/`, preserved verbatim.
3. The spec's `<spec-changelog>` gets a new entry pointing at the archived proposal.

## Inputs

User input (from `$ARGUMENTS`): a change directory name (`<date>-<slug>`), or empty (defaults
to the most recently modified `changes/<…>/proposal.html` with status `approved`).

## Preconditions

Before applying, verify all of these. **Stop and report** if any check fails:

- The proposal's `<spec-status>` is `approved` (or the user passes `--force` and confirms).
- Every `<spec-delta>` carries a valid `op` (`added | modified | removed | renamed`) and a
  `target`.
- For `op="added"`: the `target` ID does **not** yet exist in the live spec.
- For `op="modified | removed | renamed"`: the `target` ID **does** exist in the live spec.
- For `op="removed"`: both `.reason-block` and `.migration-block` contain substantive content.
- No two deltas in this proposal target the same ID.
- The proposal's `<spec-risk-log>` (if present, per `REQ-CHANGE-004`) contains no `<spec-risk>` with `status="identified"`. If any exist, refuse and list them by `target=` value. The user must transition each to `accepted`, `mitigated`, or `rejected` in the proposal artifact before retrying. `no-value-found` is fine — the critic agent self-reported nothing worth gating on.

## Procedure

1. **Locate** the proposal at `specs/<spec-id>/changes/<date>-<slug>/proposal.html`.

2. **Verify preconditions** above. Report any failures and stop; do not proceed with a partial
   apply.

3. **Read the live spec** at `specs/<spec-id>/spec.html`. Build a mental map of where each
   targeted requirement lives (which `<h3>` topic-group, which `<spec-requirement>` block).

4. **Apply each delta in order**:

   - **added** — find the topic-group that matches the new ID's prefix (e.g. `REQ-CHANGE-*`
     under a `Change management` `<h3>`). If the topic-group doesn't exist, add a new `<h3>`
     in topic order. Insert the new `<spec-requirement>` at the end of the group, copying it
     verbatim from inside the delta.
   - **modified** — locate the existing `<spec-requirement id="…">` in the live spec, replace
     its entire body with the post-state `<spec-requirement>` inside the delta.
   - **removed** — delete the `<spec-requirement id="…">` block from the live spec. Do not
     leave a placeholder. The proposal preserves the removal context; the spec stays clean.
   - **renamed** — change the `id="…"` attribute of the existing requirement and, if the body
     was also updated, replace it with the proposal's post-state. Search the entire live spec
     (and the auto-built conformance index) for cross-references to the old ID and update
     them. Do **not** rewrite archived proposals — preserved verbatim is preserved verbatim.

5. **Append a `<spec-changelog>` entry** in the live spec:

   ```html
   <li><time datetime="YYYY-MM-DD">DD Mon YYYY</time>
       <span>Applied <a href="./changes/archive/&lt;date&gt;-&lt;slug&gt;/proposal.html">&lt;slug&gt;</a>:
       &lt;one-line summary&gt;.</span></li>
   ```

6. **Move the change folder** from `specs/<spec-id>/changes/<date>-<slug>/` to
   `specs/<spec-id>/changes/archive/<date>-<slug>/`. The directory move is atomic; do not
   copy-then-delete in two steps unless the user explicitly approves.

7. **Update the proposal's status** in the archived copy to `applied`, and add a final entry
   to the proposal's own `<spec-changelog>` recording the apply date.

## Discipline

- **No symptom patching.** If a delta's `target` ID can't be located in the live spec for a
  MODIFY/REMOVE/RENAME, stop. Don't guess.
- **No silent skips.** If a delta fails its precondition, surface it; never apply a partial
  proposal "as much as you can."
- **Archive is preserved verbatim.** The folder move is the only mutation to the change
  artifact (and an in-archive `<spec-status>` flip from `approved` → `applied`).
- **Carry the risk register verbatim.** The `<spec-risk-log>` section archives as-is; never rewrite responses or statuses during apply. The author's status calls are the artifact's record of how each risk was resolved.
- **Cross-spec drift is out of scope here.** If a change touches a requirement that another
  spec references, flag it as an open question for the user rather than silently propagating.

## Output

Report:

- The live spec path and the count of deltas applied.
- The archived proposal path.
- The new entry added to the spec's changelog.
- Any cross-spec references that may need follow-up.
- The **post-apply routing nudge** (per `REQ-CHANGE-003`): one line naming whether the change is small (drive the proposal's §5 Tasks) or large (re-run `/spectastic.plan` then `/spectastic.tasks`).

Suggest opening the live spec in a browser to confirm the apply rendered cleanly.

### What's next

Per `REQ-CHANGE-003` of the meta-spec, after `/spectastic.apply` lands a change, the user needs to know where the follow-up implementation work lives. Always name the routing rule explicitly in the per-apply console report:

- **Small change** — one or two requirements, behavioural addition, no new ADRs. The implementation breakdown is the archived proposal's §5 Tasks; `/spectastic.implement` can drive those checkboxes directly.
- **Large change** — multi-requirement, architectural shift, new topic group. Re-run `/spectastic.plan` against the updated spec to revisit ADRs, then `/spectastic.tasks` to derive a fresh breakdown, then `/spectastic.implement` to drain it.

The boundary heuristic: **more than one new ADR would land → large**. Otherwise the proposal's inline tasks are the breakdown. State the rule as guidance, not a guardrail — never auto-trigger plan/tasks based on your own classification, and never refuse an apply based on it.
