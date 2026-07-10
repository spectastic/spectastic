---
description: Author or amend the project principles — the non-negotiable, project-wide rules every downstream spec must honor. Use when setting up a project's constitution, adding or changing a cross-cutting invariant, or deciding what rules every spec must obey — not a single feature's requirements (that's /spectastic.spec).
argument-hint: [project name | amendment description]
triggers:
  - "set up the project principles"
  - "author the non-negotiable rules"
  - "amend a principle"
  - "define project-wide invariants"
  - "what rules must every spec honor"
use-when: "Establishing or amending the project-wide invariants every downstream spec must honor — the constitution, authored once and changed rarely."
sibling-boundary: "Not spec (a single feature's requirements) — principles are cross-cutting rules above any one feature."
---

# /spectastic.principles

You are drafting (or amending) the **project principles** as a single-file HTML artifact in the spectastic design system. The principles establish the non-negotiable rules that bind every downstream `spec.html`, `plan.html`, and `tasks.html`.

## What spectastic is

Spectastic is a single-file HTML spec-authoring system. The lifecycle has four core phases (principles → spec → plan → tasks) plus ongoing change management (propose → apply) and triage. Each artifact is a self-contained `.html` file that uses a small vocabulary of semantic custom elements (`<spec-requirement>`, `<spec-decision>`, `<spec-status>`, etc.) styled by `assets/spec.css`. Read `specs/000-spectastic/spec.html` to see what a finished artifact looks like.

## Inputs

User input (from `$ARGUMENTS`): either the project name to ratify a new principles document, or a short description of an amendment to apply.

## Procedure

1. **Locate** the existing principles at `./principles.html` or, if not present, copy `templates/principles.html` to `./principles.html`. (If the project is itself the dotfiles or a nested project, ask the user where the artifact should live before writing.)

   **Adjust asset paths on copy.** The template's `<link>` and `<script>` use `../assets/spec.css` (one level up — correct for in-place preview from `templates/`). The destination here is the project root (zero levels up), so on copy rewrite `../assets/` → `./assets/` for both the stylesheet and the script.

   **Profile-aware seeding (spec 042).** If `.spectastic/profile.json` exists, the project was scaffolded with a profile (spec 041) and `principles.html` is already seeded with that profile's preset. Read it first: refine and ratify those seeded principles rather than starting blank, and let the profile's rigor (e.g. Verified's "done means verified") inform the interview depth.

2. **Interview** the user (only if needed — skip questions whose answers are already in `$ARGUMENTS` or in an existing principles document). Capture:
   - Project name and one-line tagline
   - One-paragraph purpose (the TL;DR)
   - 3–5 **core principles**. Each must be a non-negotiable rule, not a wish. Phrase as imperative ("Source order is reading order"), one or two sentences, with a reason.
   - In-scope items and explicit non-goals
   - Owners, decision style, amendment process
   - Any assumptions the principles rest on

3. **Fill the template**, replacing every `[PLACEHOLDER]` with the captured content. Discipline:
   - Principles are numbered `P-1` through `P-N`. IDs are stable forever — superseded principles stay numbered and link forward.
   - Use `<spec-status value="draft">` initially; the user changes it to `accepted` after ratification.
   - Date format `YYYY-MM-DD` in `datetime` attributes; "DD Mon YYYY" in visible text.
   - Version is semver: MAJOR for a principle removed or redefined, MINOR for a principle added, PATCH for wording.

4. **Sync Impact Report**. If amending, after writing the new principles document, write a short summary at the end of your reply listing:
   - Version bump (e.g. `1.2.0 → 2.0.0`) and why
   - Principles added / changed / removed
   - Which downstream specs and plans will likely need updates

5. **Validate**. Open the file in your head: does it pass its own `Principles check` (the section every plan runs against it)? If a principle is so generic it would never reject a plan, sharpen it.

## Output style

- Replace every `[PLACEHOLDER]`; never leave one in the final file.
- Prefer fewer, sharper principles to more, vaguer ones.
- Write principles in the second person plural or imperative: "Source order is reading order", "Tests precede implementation".
- The completed file is the artifact. Do not also dump the content into chat — point the user at the file path.

## After writing

Tell the user the path, the version, and propose `/spectastic.spec` for the first feature.

## Optional: CLI dispatch

Per 006 FR-009: for deterministic dispatch outside Claude Code (CI scripts, raw shell automation), the LLM MAY invoke `spectastic principles` via Bash. This bypasses LLM-driven file handling and routes through `@spectastic/core/commands/principles` directly. The markdown procedure above remains canonical; the CLI is an alternate code path.

The CLI requires `ANTHROPIC_API_KEY` in the environment for AI-coupled verbs; the slash-command path uses the in-host Claude session and needs no key.
