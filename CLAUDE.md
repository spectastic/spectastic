# CLAUDE.md — spectastic

Project-local context for Claude Code. Notes that should *not* appear in shipping copy but *do* shape decisions.

## What spectastic is

Single-file HTML spec tooling. Lifecycle: principles → spec → plan → tasks → implement → propose → apply → triage. Every artifact is a self-contained `.html` file that opens in a browser; the design system lives in `assets/spec.css` and `assets/spec.js`.

## Voice and copy

The product stands on its own. **User-facing copy references principles, not personalities.** When tempted to write "after Maggie Appleton" or "Tufte-style," say what the principle is — *calm typography*, *warm cream surface*, *margin notes*. Canonical links to real artifacts (Tufte CSS, RFC 2119, ADR, OpenSpec, the data-ink-ratio Wikipedia page) are fine and useful. Named individuals as the basis of a recommendation are not.

This file is the place for the actual aesthetic lineage, since it's project-local and helps future-Claude make consistent design decisions without leaking attribution into the surface.

## Aesthetic lineage (private)

The visual system started from a study of **Maggie Appleton's site** (maggieappleton.com). The cues taken:

- Warm cream `#f6f5f1` background instead of pure white.
- Warm dark grey `#353534` instead of pure black.
- Crimson `#5f023e` for links; no underline, subtle bottom border.
- Sea-blue `#04a5bb`, purple `#7558b2`, salmon `#e1624f` as accent colours; gold `#ffd09c` for `<mark>`.
- Fraunces (serif headings), Source Serif 4 (body), Lato (small-caps metadata), IBM Plex Mono (code).
- 8 px spacing grid; fluid type scale.
- Generous line-height and a narrow ~38 rem reading measure with a ~14 rem sidenote gutter.

**Tufte CSS** (edwardtufte.github.io/tufte-css) supplied the marginalia pattern, small-caps section openers (`<spec-newthought>`), and the data-ink-ratio framing.

**Bret Victor's Explorable Explanations** influenced the philosophy of progressive interactivity — the document is the artifact; readers can probe it but don't need a separate tool to do so.

**Don't surface these names in shipping copy.** Describe the principle, not the source.

## Inspiration log for ideas yet to come

When evaluating any future design influence, capture the *principle* version here. The shipping copy gets the principle; this file gets the breadcrumb.

| Source | Principle to keep | Where it ships |
| --- | --- | --- |
| Tufte CSS | Margin notes, small-caps openers, data-ink ratio | "Margin note", "small-caps section opener", "data-ink ratio" |
| Maggie Appleton's site | Warm cream, serif-led essay feel | "Calm typographic system" |
| Will Larson, *An Elegant Puzzle* ch. 4 | Specs over ~1,500 words must split | "Specs that cross the threshold are signalled for splitting" |
| Bill Wake, INVEST (2003) | Six story-quality criteria | "INVEST self-check" (acronym is the principle) |
| DORA / Reinertsen / Humble | Small batches reduce lead time and error | "Small-batches discipline" |
| Mike Cohn / Gojko Adzic | Vertical slicing, "How would you demo just this?" | "Smallest demoable" prompt |
| Michael Nygard | ADR shape (Context / Decision / Consequences) | "ADR" (canonical link); `<spec-decision>` carries the structure |
| Edward Tufte | Sidenotes, sparklines, marginalia | "Sidenotes", "sparkline-style architecture diagrams" |

## Commands

Seven slash commands. Don't add more without a good reason — OpenSpec's small command surface is one of its wins worth preserving.

- `/spectastic.principles` — non-negotiable principles
- `/spectastic.specify` — feature spec; carries the smallest-demoable prompt + INVEST self-check
- `/spectastic.plan` — implementation plan; refuses to run while blockers exist
- `/spectastic.tasks` — task breakdown
- `/spectastic.propose` — change proposal with typed `<spec-delta op="…">`
- `/spectastic.archive` — apply approved proposal
- `/spectastic.triage` — single-card defect triage

## Sizing discipline (implemented)

Tier 1 components added — `<spec-budget>`, `<spec-out-of-scope>` with required `defer-to=`, `<spec-parent>`, `<dl class="invest">`. Existing commands gained behavioural upgrades (smallest-demoable prompt in specify, estimability gate in plan, budget-aware splitting nudge in propose). No new verbs. See `README.md` for the retrofit recipe.

## Things deferred

Captured in `docs/openspec-considerations.html` and `examples/spectastic-spec.html` §2 (Out of scope):
- `spectastic init --tools` installer
- `spectastic validate --strict` CLI for CI
- Cross-tool installers (Cursor / Aider / Copilot)
- Action-detecting `/spectastic.next`
- A `/spectastic.split` retrofit command (the workflow does this with existing verbs)
