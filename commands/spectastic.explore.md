---
description: Build to learn — scaffold a quarantined exploration you build loosely (SDD ceremony off, thin principles floor) that the lifecycle refuses to ship until it graduates. Extended verb, upstream of spec. Use when spiking an idea, prototyping to find out if something's feasible, or exploring before committing to a spec — deliberately throwaway, unlike the committed requirements of /spectastic.spec.
argument-hint: <intent> — a one-line description of what you want to find out
triggers:
  - "build a throwaway prototype to learn"
  - "spike this idea before speccing"
  - "quarantined experiment"
  - "find out if this approach is feasible"
  - "explore before committing to a spec"
use-when: "Building loosely to learn — a quarantined exploration (SDD ceremony off, thin principles floor) upstream of a spec, that the lifecycle refuses to ship until it graduates."
sibling-boundary: "Extended, upstream of spec — unlike spec it produces no committed requirements; explore is deliberately throwaway until it graduates."
model: inherit
---

# /spectastic.explore

You are scaffolding an **exploration** — the front half of the discovery loop (spec `022-explore`). `explore
<intent>` captures a one-line intent and scaffolds a *quarantined* place to build loosely: the SDD ceremony
off, a thin principles floor on. It is an **extended verb**: opt-in, sitting *upstream* of the eight core
lifecycle verbs — it does not join or alter them (FR-001). The slogan is **"vibe to learn, spec to keep."**

The only exits from an exploration are **graduate** or **delete** (FR-009). Both halves ship: this verb
scaffolds and quarantines (spec `022-explore`); **graduation** — classify spike vs tracer-bullet, extract the
spec + design from the build, restore the gates — is the `--graduate` mode below (spec `023-explore-graduation`),
and the path-appropriate restore lands as `/spectastic.tasks <id> --restore` (spec `024-explore-restore`).

## What it does

`spectastic explore "<intent>"` resolves the next `NNN-kebab` id (shared scheme with `specs/`) and writes two
artifacts under `explorations/<id>/`:

- **`explore.html`** — the rich, **git-ignored** ledger (intent · built/tried/worked/didn't · a run block in
  the verify.html Run/Demo shape). Loose by design; the thin floor keeps only P-1 (single-file) and P-2
  (semantic tags) in force. No requirement IDs, no INVEST, no conformance index (D-005 / FR-007).
- **`quarantine.json`** — the small, **tracked**, machine-readable marker (`{ id, intent, status, created }`).
  This is the anti-ship guard: it stays visible to teammates and CI even though the ledger is local-only
  (FR-004 / D-002).

Then **build loosely** with your normal tools inside `explorations/<id>/`. Record what you learn in the
ledger; record what actually ran in the run block so a later graduation can promote it to verified grounding
(FR-008).

## The anti-ship guard (read this)

An exploration is **quarantined**. The guard has two legs (D-003):

1. **`spectastic validate` always errors** while any `quarantine.json` with `status:"quarantined"` is tracked.
   This is the merge gate — CI fails, so nothing un-graduated can reach production (SC-002). **Your branch is
   red by design until you graduate or delete the exploration.** This is intended friction, not a bug — see
   the finding message: *"quarantined — graduate or delete to clear"*.
2. **The verb state-gate refuses** to advance an exploration id through the core verbs — you cannot
   `design`/`tasks`/`propose`/`apply` a quarantined exploration into a terminal state. Graduation is the only
   bridge into the spec lifecycle (deferred).

There is no path from a loose build to production that skips graduation (FR-006). That is the whole point: the
relaxation is safe *because* it is bounded.

## Procedure

1. **Capture the intent.** One line — the question this build is trying to answer. If the user gave a
   paragraph, distil it to a sentence and confirm.
2. **Scaffold.** Run `spectastic explore "<intent>"`. It resolves the id, reads `templates/explore.html`,
   writes the ledger + marker, and prints the path.
3. **Build loosely.** Work inside `explorations/<id>/`. No ceremony — try things, keep what teaches you.
   Update the ledger's built/tried/worked/didn't log as you go.
4. **Record the run.** Capture the commands you actually ran in §3 of the ledger (the Run/Demo shape) so the
   facts the build proved are ready for graduation's grounding ledger.
5. **Exit.** When you know the answer: **graduate** it (`--graduate <id>`, see below) or **delete** the
   `explorations/<id>/` directory. Do not try to ship it un-graduated; the guard won't let you, deliberately.

## Graduate mode (`--graduate <id>`, spec 023-explore-graduation)

The back half of the loop: turn a quarantined exploration into a real, verified-grounded **spec + design**, then
lift the quarantine and archive the exploration as discovered-not-guessed history. Three steps:

1. **Classify.** Ask the explorer (via `AskUserQuestion`) whether the build is a **spike** (threw it together to
   answer a question — keep the *learning*, rebuild clean) or a **tracer-bullet** (a usable skeleton — keep the
   *code*, back-fill the spec, harden in place). Recorded immutably in the archived marker; it decides the
   restore path.
2. **Extract.** Read the build's demonstrated behaviour into a Draft `specs/<id>/spec.html` + `design.html`,
   reusing the id. The run record's proven facts (the ledger's §3) become `verified` rows in the **design's** §3
   evidence ledger — the grounding ledger is a design artifact, `REQ-LIFECYCLE-006` — citing the archived
   exploration. Interview what the build never answered (intent, quantified NFRs, edge cases) exactly as a cold
   `/spectastic.spec` + `/spectastic.design` would (D-007).
3. **Lift + archive.** The deterministic transaction writes the bundle, archives `explorations/<id>/` →
   `explorations/archive/<id>/` (deepening the ledger's paths), and flips the marker `quarantined` →
   `graduated` **last**. All-or-nothing: a failure leaves the exploration quarantined and refusable with no
   partial `specs/<id>/` (`SC-003`). Refuses if `specs/<id>/` exists or the exploration is not quarantined.

**CLI:** `spectastic explore --graduate <id> --classify <spike|tracer-bullet>` (AI-coupled — needs
`ANTHROPIC_API_KEY`; the slash path is keyless via the in-host session).

**Next:** review the Draft spec + design, then `/spectastic.tasks`. After graduating, run
`/spectastic.tasks <id> --restore` (spec **`024-explore-restore`**) to generate the path-appropriate
**restore-task scaffolding** — refactor-to-comply for a tracer-bullet, clean-rebuild for a spike.

## Out of scope (this verb)

- The restore-task generation (refactor-to-comply vs clean-rebuild) — landed in **`024-explore-restore`** as a `--restore` mode of `/spectastic.tasks`.
- A think-first (think-to-learn) discovery mode — considered separately.
- A negative-result / "abandoned" terminal state for an exploration that won't graduate.
