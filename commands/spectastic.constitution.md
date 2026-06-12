---
description: Author or amend the project constitution — the principles every downstream spec must honor.
argument-hint: [project name | amendment description]
---

# /spectastic.constitution

You are drafting (or amending) a **project constitution** as a single-file HTML artifact in the spectastic design system. The constitution establishes the non-negotiable principles that bind every downstream `spec.html`, `plan.html`, and `tasks.html`.

## What spectastic is

Spectastic is a single-file HTML spec-authoring system. The lifecycle has four core phases (constitution → spec → plan → tasks) plus ongoing change management (propose → archive) and triage. Each artifact is a self-contained `.html` file that uses a small vocabulary of semantic custom elements (`<spec-requirement>`, `<spec-decision>`, `<spec-status>`, etc.) styled by `assets/spec.css`. Read `examples/spectastic-spec.html` to see what a finished artifact looks like.

## Inputs

User input (from `$ARGUMENTS`): either the project name to ratify a new constitution, or a short description of an amendment to apply.

## Procedure

1. **Locate** the existing constitution at `./constitution.html` or, if not present, copy `templates/constitution.html` to `./constitution.html`. (If the project is itself the dotfiles or a nested project, ask the user where the artifact should live before writing.)

2. **Interview** the user (only if needed — skip questions whose answers are already in `$ARGUMENTS` or in an existing constitution). Capture:
   - Project name and one-line tagline
   - One-paragraph purpose (the TL;DR)
   - 3–5 **core principles**. Each must be a non-negotiable rule, not a wish. Phrase as imperative ("Source order is reading order"), one or two sentences, with a reason.
   - In-scope items and explicit non-goals
   - Owners, decision style, amendment process
   - Any assumptions the constitution rests on

3. **Fill the template**, replacing every `[PLACEHOLDER]` with the captured content. Discipline:
   - Principles are numbered `P-1` through `P-N`. IDs are stable forever — superseded principles stay numbered and link forward.
   - Use `<spec-status value="draft">` initially; the user changes it to `accepted` after ratification.
   - Date format `YYYY-MM-DD` in `datetime` attributes; "DD Mon YYYY" in visible text.
   - Version is semver: MAJOR for a principle removed or redefined, MINOR for a principle added, PATCH for wording.

4. **Sync Impact Report**. If amending, after writing the new constitution, write a short summary at the end of your reply listing:
   - Version bump (e.g. `1.2.0 → 2.0.0`) and why
   - Principles added / changed / removed
   - Which downstream specs and plans will likely need updates

5. **Validate**. Open the file in your head: does it pass its own `Constitution check` (the section every plan runs against it)? If a principle is so generic it would never reject a plan, sharpen it.

## Output style

- Replace every `[PLACEHOLDER]`; never leave one in the final file.
- Prefer fewer, sharper principles to more, vaguer ones.
- Write principles in the second person plural or imperative: "Source order is reading order", "Tests precede implementation".
- The completed file is the artifact. Do not also dump the content into chat — point the user at the file path.

## After writing

Tell the user the path, the version, and propose `/spectastic.specify` for the first feature.
