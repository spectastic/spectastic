---
description: Apply an approved change proposal — fold its deltas into the live spec and archive the change folder (or withdraw an authored proposal). Use when landing or merging an approved proposal, or withdrawing one — not authoring the proposal (/spectastic.propose) or draining the folded tasks (/spectastic.implement).
argument-hint: [<date>-<slug>, defaults to most recent approved proposal]
triggers:
  - "apply the approved proposal"
  - "land the change into the live spec"
  - "fold the deltas in and archive the change"
  - "merge the proposal"
  - "withdraw an authored proposal"
use-when: "Folding an approved proposal's deltas into the live spec and archiving the change folder — or withdrawing an authored proposal."
sibling-boundary: "Not propose (which authors the proposal apply consumes); not implement (which drains the tasks apply folds into tasks.html)."
model: sonnet
---

# /spectastic.apply

You are applying an **approved change proposal** to the live spec it targets. Output is
threefold:

1. The live `spec.html` is patched — each delta is applied in place.
2. The change folder moves from `specs/<spec-id>/changes/<date>-<slug>/` to
   `specs/<spec-id>/changes/archive/<date>-<slug>/`, preserved verbatim.
3. The spec's `<spec-changelog>` gets a new entry pointing at the archived proposal.

## Inputs

`/spectastic.apply` runs in one of two modes:

**Apply mode (default).** User input is `<date>-<slug>` or empty (defaults to the most recently modified `changes/<…>/proposal.html` with status `approved`). Folds the proposal's deltas into the live spec; folder moves to `specs/000-spectastic/changes/archive/<slug>/`.

**Withdraw mode.** `--withdraw <YYYY-MM-DD>-<slug> --reason="<one-line>"`. Both `<slug>` and `--reason="…"` are required. The proposal is rejected post-authorship: status flips to `withdrawn`, folder moves to `specs/000-spectastic/changes/withdrawn/<YYYY-MM-DD>-<slug>/` (parallel to `archive/`), and the live spec's `<spec-changelog>` records "Considered `<slug>`, withdrew on `<date>` because `<reason>`." Withdraw is terminal — to revive a withdrawn proposal, author a new one.

## Preconditions

### Apply mode

Before applying, verify all of these. **Stop and report** if any check fails:

- The proposal's `<spec-status>` is `approved` (or the user passes `--force` and confirms).
- Every `<spec-delta>` carries a valid `op` (`added | modified | removed | renamed`) and a
  `target`.
- For `op="added"`: the `target` ID does **not** yet exist in the live spec.
- For `op="modified | removed | renamed"`: the `target` ID **does** exist in the live spec.
- For `op="removed"`: both `.reason-block` and `.migration-block` contain substantive content.
- No two deltas in this proposal target the same ID.
- The proposal's `<spec-risk-log>` (if present, per `REQ-CHANGE-004`) contains no `<spec-risk>` with `status="identified"`. If any exist, refuse and list them by `target=` value. The user must transition each to `accepted`, `mitigated`, or `rejected` in the proposal artifact before retrying. `no-value-found` is fine — the critic agent self-reported nothing worth gating on.

### Withdraw mode

Before withdrawing, verify all of these. **Stop and report** if any check fails:

- The proposal exists at `specs/000-spectastic/changes/<YYYY-MM-DD>-<slug>/proposal.html` (i.e. is not already archived under `archive/` or withdrawn under `withdrawn/`).
- The proposal's `<spec-status>` is one of `proposed | under-review | approved` — **not** `applied` and **not** already `withdrawn`. Withdraw is one-way.
- `--reason="<one-line>"` is non-empty. Empty rejection reason is not substantive; refuse.

## Procedure

Apply mode's mechanical work — folding each delta into the live spec, the live-spec changelog
entry, the §6 task-fold, the proposal status flip, the archived-proposal path-rewrite, and the
archive move — is performed **deterministically by the kernel** (`spectastic apply`, per
`REQ-CHANGE-007` / `REQ-CHANGE-008`), not by hand. Your job is the judgment around it: the
preconditions, the author-voiced summary, the cross-spec exception, and the routing nudges.
(Withdraw mode is still done by hand — see the Withdraw procedure below.)

1. **Locate** the proposal at `specs/<spec-id>/changes/<date>-<slug>/proposal.html`.

2. **Verify preconditions** above. **Stop and report** if any fail — do not invoke the kernel on a
   proposal that won't pass. In particular, run the `REQ-CHANGE-004` risk gate yourself: if any
   `<spec-risk status="identified">` remains, refuse and **list them by `target=` value** so the
   author knows exactly what to transition. The kernel re-enforces this gate authoritatively (it
   throws on an identified risk); listing them here is the human-readable pre-check.

3. **Confirm the kernel is available.** Check that `spectastic apply` resolves — the CLI is built
   and on `PATH`, or use the repo-local `packages/cli/bin/spectastic`. If it doesn't resolve, stop
   and report (build `packages/cli` first). Apply is **keyless** — the kernel is deterministic and
   needs no `ANTHROPIC_API_KEY`.

4. **Compose the changelog summary.** Write one rich line in the author's voice — what landed and
   why — to pass as `--summary`. This preserves the changelog's human voice; without it the kernel
   falls back to a terse delta count.

5. **Invoke the kernel** via Bash:

   ```bash
   spectastic apply <spec-id> <date>-<slug> --summary "<your one-line summary>"
   ```

   This single call deterministically: applies each delta into the live `spec.html` (ADD / MODIFY /
   REMOVE / RENAME, with intra-spec reference rewrites on rename); appends the live-spec
   `<spec-changelog>` entry using your `--summary`; folds the proposal's §6 into the target's
   `tasks.html` as a provenance-linked phase in a fresh hundred-range (`REQ-CHANGE-006`),
   implementing none of them; flips the archived proposal's `<spec-status>` / `<spec-change>` to
   `applied` and records its apply entry; deepens the archived proposal's relative paths for the
   new depth; and moves the folder to `changes/archive/<date>-<slug>/`. The fold runs **before**
   the move, so a fold failure leaves the proposal in place for a clean retry.

   **Principles proposals (spec 030).** When the proposal targets `principles.html` — its folder is the
   root-level `changes/<date>-<slug>/` and its `<spec-meta>` `Spec` row points at `principles.html` — pass the
   reserved spec-id `principles`: `spectastic apply principles <date>-<slug> --summary "…"`. The kernel then
   resolves root paths, inserts the principle bare, substitutes the version/tagline/TL;DR from the proposal's
   `<spec-principles-apply>` block, and archives — no `tasks.html` fold (a principles proposal's §6 is the apply
   mechanics). The proposal MUST carry a `<spec-principles-apply>` block (`<version from="…">…</version>`,
   `<tagline>`, `<tldr>`) or the kernel refuses.

   **Cross-spec exception (markdown-handled).** The kernel applies **same-spec deltas only**. If a
   delta's `target` lives in another spec, the kernel leaves it untouched — apply those by hand per
   the "Cross-spec drift" Discipline note below and flag them to the user. This is the one
   mechanical step that stays with the markdown.

6. **Report the kernel's result.** Read its stdout — deltas applied, the archived path, and the
   fold's `T-NNN` range — into the Output section below. If `spectastic apply` exits non-zero,
   surface its error verbatim and stop; never paper over a partial apply.

## Withdraw procedure

When invoked with `--withdraw <YYYY-MM-DD>-<slug> --reason="<one-line>"`:

1. **Locate** the proposal at `specs/000-spectastic/changes/<YYYY-MM-DD>-<slug>/proposal.html`. Refuse if it already lives under `archive/` or `withdrawn/`.

2. **Verify Withdraw-mode preconditions** above. Report any failure; do not partially withdraw.

3. **Flip the proposal status** in place from `proposed | under-review | approved` to `withdrawn`. Both the `<spec-status>` pill and the `<spec-change status="…">` wrapper attribute must agree.

4. **Move the change folder** from `specs/000-spectastic/changes/<YYYY-MM-DD>-<slug>/` to `specs/000-spectastic/changes/withdrawn/<YYYY-MM-DD>-<slug>/`. Atomic move; do not copy-then-delete. Create `specs/000-spectastic/changes/withdrawn/` if it does not yet exist. The date-prefixed folder name is preserved per `REQ-CHANGE-001`.

5. **Rewrite the moved proposal's relative paths** for the new depth (same depth as `archive/`, so `../assets/` → `../../../../assets/`, sibling spec link → `../../../spectastic-spec.html`, etc.). The path-rewrite shape mirrors what Apply mode does on archive.

6. **Append a `<spec-changelog>` entry** to the live spec it targeted:

   ```html
   <li><time datetime="YYYY-MM-DD">DD Mon YYYY</time>
       <span>Considered <a href="./changes/withdrawn/&lt;YYYY-MM-DD&gt;-&lt;slug&gt;/proposal.html">&lt;YYYY-MM-DD&gt;-&lt;slug&gt;</a>,
       withdrew on &lt;DD Mon YYYY&gt; because &lt;reason&gt;.</span></li>
   ```

   This is the single index of "what was considered" so future-you can find rejected ideas via the live spec without walking `changes/withdrawn/`.

7. **Append a `<spec-changelog>` entry** to the moved proposal itself recording the withdrawal date and the reason verbatim.

8. **Surface the originating inbox-card nudge.** If the proposal's `<spec-meta>` `Source` row (or its body) references an inbox card by ID (`I-NNN`), report a one-line suggestion that the originating card be transitioned to `data-status="rejected"` with a new `<dt>Rejected because</dt>` row citing the withdrawn proposal and the reason. The card transition itself is the author's gesture, not an apply side effect — the symmetric move to step 6's `<spec-changelog>` entry on the live spec, but for Surface A instead of Surface B.

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
- The **task fold** (per `REQ-CHANGE-006`): the target `tasks.html` the §6 tasks were folded into (and whether it was created), and the new phase / `T-NNN` range. Apply implemented none of them.
- The **post-apply routing nudge** (per `REQ-CHANGE-003`): one line — small change → run `/spectastic.implement` on the folded phase; large change → optionally re-run `/spectastic.plan` + `/spectastic.tasks` (regenerates, supersedes the fold).
- The **originating inbox-card nudge** (if the proposal's `<spec-meta>` `Source` row points at `inbox.html#I-NNN`, or if the proposal's prose references an inbox card by ID): one line suggesting that the originating card be transitioned to `data-status="done"` with a new `<dt>Closed by</dt>` row pointing at the archived proposal and the requirement that landed. Apply does **not** make this transition automatically; the inbox-card update is the author's gesture (mirrors the Surface-A discipline in `REQ-CHANGE-005`). Without this nudge in the report, the lifecycle's view and the inbox's view drift apart silently.

Suggest opening the live spec in a browser to confirm the apply rendered cleanly.

### What's next

Per `REQ-CHANGE-003` of the meta-spec, after `/spectastic.apply` lands a change, the user needs to know where the follow-up implementation work lives. Always name the routing rule explicitly in the per-apply console report:

The proposal's §6 tasks have already been **folded into the target's `tasks.html`** as a new provenance-linked phase (by the kernel, step 5). Apply implemented nothing — `/spectastic.implement` drains the folded phase.

- **Small change** — one or two requirements, behavioural addition, no new ADRs. Run `/spectastic.implement` to drain the folded phase.
- **Large change** — multi-requirement, architectural shift, new topic group. You may instead re-run `/spectastic.plan` against the updated spec to revisit ADRs, then `/spectastic.tasks` to derive a fresh breakdown — which regenerates `tasks.html` and **supersedes the folded phase** — then `/spectastic.implement`.

The boundary heuristic: **more than one new ADR would land → large**. State the rule as guidance, not a guardrail — apply always folds (it never self-classifies); the large-change re-plan is the author's choice, not apply's.

## Note on the kernel

Apply mode's procedure above **is** the kernel path — the slash command invokes `spectastic apply`
as its engine (per `REQ-CHANGE-008`), rather than re-deriving the mechanical edits by hand each
time. For deterministic dispatch outside Claude Code (CI scripts, raw shell automation), invoke the
same `spectastic apply <spec-id> <date>-<slug> --summary "…"` directly; only the preconditions,
the author summary, the cross-spec exception, and the routing nudges need a human (or the slash
command) in the loop.

Apply and withdraw are **keyless** — the kernel is deterministic and needs no `ANTHROPIC_API_KEY`.
Only the AI-coupled verbs (`spec`, `plan`) require the key (006 FR-009).
