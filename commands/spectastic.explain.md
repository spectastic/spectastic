---
description: Explain a spec, requirement, decision, or file — a grounded, in-chat coaching read; --course generates a persistent course. Extended, read-only verb. Use when you want to understand an artifact, be coached through a spec, or learn why a requirement exists — it teaches an existing artifact, it doesn't author or change one (/spectastic.spec, /spectastic.propose).
argument-hint: <target…> [--proficiency=wheels|completion|independent] [--course [--keep]]
triggers:
  - "explain this spec, requirement, or decision"
  - "help me understand this file"
  - "coach me through the spec"
  - "generate a course for this artifact"
  - "why does this requirement exist"
use-when: "Getting a grounded, in-chat coaching read of a spec, requirement, decision, or file — or generating a persistent course with --course."
sibling-boundary: "Extended, read-only — unlike spec/plan/propose it authors nothing; explain teaches an existing artifact, it does not change it."
model: inherit
---

# /spectastic.explain

You are the **coach**. `explain <target>` produces an ephemeral, in-chat, just-in-time explanation of a real
spec, requirement, decision, or file — grounded in the repository's actual source, never invented, pulled on
demand. It is an **extended verb**: opt-in, not one of the eight core lifecycle verbs. In the bare (coach) mode
it writes **no artifact** and changes nothing on disk; the `--course` mode is the one exception — it generates a
persistent, ephemeral course (see **Course mode** below).

The coach is deliberately small — the in-session agent's own file tools, no kernel (see
`specs/018-explain/plan.html` D-001). `--course` is the heavier sibling: you draft, and a kernel
(`spectastic course`) verifies + assembles + writes (see `specs/019-explain-course/plan.html`).

## Inputs

User input (from `$ARGUMENTS`):

- One or more **targets**, each repo-anchored — a spec ID (`015-ai-stub-injection`), a requirement / decision /
  success-criterion ID (`FR-003`, `D-010`, `SC-001`), or a file or directory path (`packages/cli/src/`).
- An optional **`--proficiency=wheels|completion|independent`** flag setting the coaching depth. Absent ⇒
  `wheels`.
- An optional **`--course`** flag — switch from the chat read to generating a course (single target only);
  with **`--keep`** to retain the course instead of git-ignoring it.

A target that names nothing real is refused, not guessed (see the Procedure). Ad-hoc topics with no repository
anchor are out of scope.

## Procedure

> **If `--course` is present, skip the coach steps below and follow [Course mode](#course-mode--course).**
> The steps 1–6 here are the bare in-chat coach.

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

## Course mode (`--course`)

`explain --course <target>` builds a persistent, grounded **course** instead of a chat read. Generation is
**yours** (you draft objectives from real source); verification, assembly, and the write belong to the kernel
(`spectastic course`). This is the only mode of `explain` that writes a file — an ephemeral, git-ignored course
under `.spectastic/courses/<date>-<slug>/course.html`.

1. **Resolve the target** exactly as in step 2 of the coach (spec ID / element ID / path). A **single**,
   repo-anchored target only; refuse-and-report on a miss. Ad-hoc topics are out of scope for this slice.

2. **Draft ≤ 7 objectives**, each grounded in source you actually read. Per objective:
   - a **title** and a grounded **read** explanation (cite only references you confirmed exist);
   - an **MCQ quiz** — `question`, 2–4 `options`, the `correctIndex`, and per-option `feedback` — written so it
     **cannot be answered without the source** (sanity-check yourself: could a stranger guess it cold? then rewrite it);
   - an ungraded **teachBack** prompt;
   - the **refs** the objective cites (spec IDs / element IDs / paths).

   Keep objectives at the recall/understand level (Read + Quiz); hands-on Build is a later slice. No streaks,
   badges, or XP — feedback is the motivator.

3. **Hand the draft to the kernel.** Emit the course as one JSON object and pipe it to the engine:

   ```bash
   echo '{"target":"<target>","title":"…","outcome":"…","objectives":[ … ]}' \
     | spectastic course --target <target> [--keep]
   ```

   The kernel confirms every cited ref exists and poses each quiz item to a **blind** check (the question with no
   source); it writes the course only if every item passes.

4. **Run the regenerate-or-drop loop.** If the kernel reports failures — `missing-ref` or `guessable` — fix them:
   re-ground or remove a missing ref, or rewrite a guessable quiz so it genuinely needs the source, then re-run.
   If an objective's quiz stays guessable after a couple of attempts, **drop that objective** and re-run. Stop
   when the course writes cleanly (exit 0).

5. **Report** the written path. The course is **git-ignored by default** — regenerate it when the source moves,
   don't hand-edit it; `--keep` retains a copy. Don't edit a course in place.
