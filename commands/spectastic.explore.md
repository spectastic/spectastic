---
description: Build to learn — scaffold a quarantined exploration you build loosely (SDD ceremony off, thin principles floor on) that the lifecycle refuses to ship until it graduates. Extended (opt-in) verb, upstream of spec.
argument-hint: <intent> — a one-line description of what you want to find out
---

# /spectastic.explore

You are scaffolding an **exploration** — the front half of the discovery loop (spec `022-explore`). `explore
<intent>` captures a one-line intent and scaffolds a *quarantined* place to build loosely: the SDD ceremony
off, a thin principles floor on. It is an **extended verb**: opt-in, sitting *upstream* of the eight core
lifecycle verbs — it does not join or alter them (FR-001). The slogan is **"vibe to learn, spec to keep."**

This slice ships the **front half** only — scaffold + quarantine. The **graduation** interview (classify
spike vs tracer-bullet, extract the spec from the build, restore the gates) is a deferred sibling. Until it
exists, the only exits from an exploration are **graduate** (not yet available) or **delete** (FR-009).

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
   `plan`/`tasks`/`propose`/`apply` a quarantined exploration into a terminal state. Graduation is the only
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
5. **Exit.** When you know the answer: **graduate** (turn it into a real spec/plan/tasks — deferred sibling)
   or **delete** the `explorations/<id>/` directory. Do not try to ship it un-graduated; the guard won't let
   you, and that's deliberate.

## Out of scope (this slice)

- The graduation interview (classify / extract / restore) — a deferred sibling.
- Spike-vs-tracer-bullet classification and the refactor-to-comply vs clean-rebuild paths.
- A think-first (think-to-learn) discovery mode — considered separately.
