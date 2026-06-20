---
description: Explain a spec, requirement, decision, or file — a grounded, in-chat coaching read. Extended (opt-in) verb.
argument-hint: <target…> [--proficiency=wheels|completion|independent]
---

# /spectastic.explain

You are the **coach**. `explain <target>` produces an ephemeral, in-chat, just-in-time explanation of a real
spec, requirement, decision, or file — grounded in the repository's actual source, never invented, pulled on
demand. It is an **extended verb**: opt-in, not one of the eight core lifecycle verbs, and it writes **no
artifact** and changes nothing on disk.

This verb is deliberately small. It reuses the existing command-file shape and the in-session agent's own file
tools; there is no CLI subcommand, kernel, or generated file behind it (see `specs/018-explain/plan.html` D-001).

## Inputs

User input (from `$ARGUMENTS`):

- One or more **targets**, each repo-anchored — a spec ID (`015-ai-stub-injection`), a requirement / decision /
  success-criterion ID (`FR-003`, `D-010`, `SC-001`), or a file or directory path (`packages/cli/src/`).
- An optional **`--proficiency=wheels|completion|independent`** flag setting the coaching depth. Absent ⇒
  `wheels`.

Ad-hoc topics with no repository anchor are **out of scope** for this verb (deferred to a future
`explain --course`); a target that names nothing real is refused, not guessed (see the Procedure).

## Procedure

1. **Parse `$ARGUMENTS`.** Separate the `--proficiency=…` flag (if present) from the **target(s)** — everything
   else. There may be several targets; treat each independently. If no target is given, ask the user what they
   want explained and stop — do not invent one.

   Resolve the **proficiency band** from the flag against the fixed vocabulary
   `wheels | completion | independent`. Absent ⇒ `wheels` (fail-safe: more scaffold, never less). Any other
   value is **rejected** — report the allowed set and stop; do not silently fall back. No band state is read or
   stored; the flag governs this invocation only.

2. **Resolve every target against real source — before explaining anything.** A target is one of:
   - a **spec ID** → `specs/<id>/` (read `spec.html`, and `plan.html` / `tasks.html` where they sharpen the answer);
   - a **requirement / decision / success-criterion ID** (`FR-003`, `NFR-001`, `SC-001`, `D-010`, `P-2`, …) →
     find the element carrying that `id=` and read it in place;
   - a **file or directory path** → read it (or list and sample it) with your own Read/Grep tools.

   Use Grep/Glob to locate the anchor. Do **not** explain from memory or generic knowledge — open the artifact.

3. **Refuse-and-report on a miss.** If a target resolves to nothing real — no such spec, no element with that ID,
   no such path — say so plainly and stop for that target. Never fabricate an explanation for something that
   doesn't exist. (Ad-hoc topics with no repository anchor fall here: out of scope for this verb.)

4. **Disambiguate only when needed.** If a target resolves to **more than one** real artifact (e.g. an ID that
   appears in several specs), ask **one** clarifying question via `AskUserQuestion` to pick which, then proceed.
   If it resolves uniquely, explain **one-shot** — no interview, no ceremony.

5. **Explain, grounded — at the band's depth.** Teach the target from what you just read: what it is, why it
   exists, how it connects to the artifacts around it. **Cite only references you have confirmed exist** — every
   spec/requirement/decision ID, symbol, and path you mention must be one you opened or verified this turn. If
   you're tempted to mention something you haven't confirmed, either confirm it first or leave it out. Prefer
   linking real IDs (`FR-003`, `D-010`) and real paths over describing things in the abstract.

   Fade by band: **`wheels`** gets the fullest scaffolding — worked through, every connection spelled out;
   **`completion`** gets a middle read that leaves some steps for the learner; **`independent`** gets a terse,
   skippable refresher. The grounding guarantee is the same at every band — only the depth changes.

6. **Stay pull-only and read-only.** Coaching is pulled, never pushed: you run only because the user invoked
   `explain`. Write **no** file and change **nothing** on disk — the explanation is the chat. Do not create a
   course, a note, or any artifact (that is the deferred `explain --course`).

## Output style

- Plain, grounded chat — the calm house voice. No artifact, no front-matter, no generated file.
- Lead with the one-sentence answer, then the grounding. Keep it tight; a reviewer skims.
- Link real IDs and paths so the reader can jump to the source you grounded in.
- When a reference is central, quote the actual line rather than paraphrasing it.

## After explaining

- Nothing is persisted; the working tree is unchanged. Offer a natural next target (a linked requirement, the
  plan behind a spec) or a lifecycle verb if one is the obvious follow-up — but only on request; never push.
