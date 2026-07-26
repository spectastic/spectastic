# Manual smoke — `explain --course` (the grounded course)

The kernel's guarantees are pinned by stub-driven integration tests
([packages/cli/test/course.integration.test.ts](../../packages/cli/test/course.integration.test.ts)) — structure,
reference existence (SC-001), guessable-item rejection (SC-002), no-JS degradation (SC-003). What a stub can't
judge is **course quality with a real model**: are the objectives well-chosen, the readings actually grounded,
the quizzes genuinely unguessable? That's this checklist. It is a dev aid — not bundled or installed.

## Plumbing smoke (deterministic, no API key)

Confirms the end-to-end pipe produces a real artifact. Run from the repo root:

```bash
printf '%s' '{"target":"015-ai-stub-injection","title":"AI stub injection",
  "outcome":"explain how the stub provider is injected",
  "objectives":[{"title":"Factory routing","read":"createAIProvider routes to the stub when SPECTASTIC_AI_STUB is set.",
    "quiz":{"question":"What env var selects the stub provider?","options":["SPECTASTIC_STUB","SPECTASTIC_AI_STUB","AI_STUB"],"correctIndex":1,"feedback":["","right",""]},
    "teachBack":"Describe the factory fallthrough.","refs":["FR-007","SC-001"]}]}' \
  | SPECTASTIC_AI_STUB=/tmp/blind.json node packages/cli/bin/spectastic course --target 015-ai-stub-injection
```

…where `/tmp/blind.json` is `{"subagent":[{"output":"0"}]}` (blind answer wrong ⇒ not guessable).

- **Assert** exit 0 and a course written under `.spectastic/courses/<date>-015-ai-stub-injection/course.html`.
- **Assert** `git status --porcelain` does **not** list it (git-ignored via `.spectastic/.gitignore`). ([FR-001](./spec.html#FR-001))
- **Open it in a browser** — the ledger, Read/Quiz tabs, and teach-back render; with JS the quiz unlocks the checkbox, with JS off the answer `<details>` self-reveals and the checkbox is markable. ([FR-006](./spec.html#FR-006), [SC-003](./spec.html#SC-003))

## Keyless in-host smoke (needs `claude` on PATH, no `ANTHROPIC_API_KEY`)

Confirms the fix for [triage T-004](./triage-log.html#T-004) / [NFR-003](./spec.html#NFR-003): the guessability check
(and 060's analogy-fit check, when present) runs the real blind judgment via the in-host
[`ClaudeCliProvider`](../../packages/core/src/providers/claude-cli.ts) — no key, using the host session — rather
than failing outright or silently demoting to advisory ([P-8](../../principles.html#P-8)). Run with
`ANTHROPIC_API_KEY` unset and no `SPECTASTIC_AI_STUB`, so `createAIProvider`'s precedence rung
([D-006](./plan.html#D-006)) falls to the `claude`-on-PATH branch:

```bash
printf '%s' '{"target":"NFR-003","title":"Keyless in-host verification",
  "outcome":"explain how the course kernel verifies quiz items without an ANTHROPIC_API_KEY",
  "objectives":[{"title":"The keyless model id",
    "read":"createAIProvider'"'"'s fourth precedence rung constructs a ClaudeCliProvider when no SPECTASTIC_AI_STUB and no ANTHROPIC_API_KEY are set but `claude` is detected on PATH. That provider reports a fixed, literal model id string for the Assisted-by trailer, distinct from any resolved Claude model tier, because the host session'"'"'s actual model is opaque to it.",
    "quiz":{"question":"What literal string does the keyless in-host provider report as its `model` id?",
      "options":["claude-cli-host","claude-cli","in-host-claude","claude-session"],"correctIndex":1,
      "feedback":["","Right — a fixed literal, not a resolved model tier.","",""]},
    "teachBack":"Explain why this provider'"'"'s model id can'"'"'t just be the resolved per-verb model tier.",
    "refs":["NFR-003","FR-004"]}]}' \
  | env -u ANTHROPIC_API_KEY node packages/cli/bin/spectastic course --target NFR-003
```

**Real run, 26 Jul 2026** — `env -u ANTHROPIC_API_KEY` (no `SPECTASTIC_AI_STUB` either), `claude` resolved from
`/opt/homebrew/bin/claude` on PATH:

- **Exit 0** — `Wrote .spectastic/courses/2026-07-26-nfr-003/course.html (1 objectives) — git-ignored.` No raw
  provider stack trace, no `ANTHROPIC_API_KEY is not set` crash — the bug T-004 reported.
- **Guessability check ran for real, blind** — the kernel posed the quiz (four plausible-looking option strings,
  including three that read as reasonable guesses) to a fresh `claude -p` process with *only* the question text;
  it correctly judged the item unguessable and shipped it, rather than rejecting or (worse) rubber-stamping it.
  This is the real thing D-007 guards, not a stub standing in for it.
- **Assisted-by trailer confirms the provider that actually ran**: `grep claude-cli course.html` finds the literal
  id three times (the read's prose, the correct option's label, and the ledger) — proof the keyless
  `ClaudeCliProvider` executed the check, not a silently-skipped verification.
- **Git-ignored, confirmed**: `git status --porcelain .spectastic/` reports nothing.

The negative case (no key, no stub, `claude` *not* on PATH) was also verified this session by excluding it from
`PATH`: `createAIProvider` throws the actionable
`No AI provider is available. Set ANTHROPIC_API_KEY, or run inside a host with the \`claude\` CLI on PATH (e.g. Claude Code), or set SPECTASTIC_AI_STUB for a deterministic CI stub.`
— `course` catches it and exits 2 with that message on stderr, never an uncaught stack trace.

## Real-LLM quality smoke (needs `ANTHROPIC_API_KEY`, local-only)

Run `/spectastic.explain --course <a real spec>` in a Claude Code session (no stub), letting the agent draft and
the kernel verify against a real model:

- **Grounding** — open every cited ID/path in the course; all resolve to real source, none invented. ([SC-001](./spec.html#SC-001))
- **Unguessability** — pick a quiz and try to answer it without reading the source; you shouldn't be able to. The kernel should already have rejected any it could answer blind. ([SC-002](./spec.html#SC-002))
- **Shape** — ≤7 objectives ([NFR-001](./spec.html#NFR-001)); no streaks/badges/XP ([FR-008](./spec.html#FR-008)); each objective has a Read, an MCQ, and an ungraded teach-back ([FR-005](./spec.html#FR-005), [FR-007](./spec.html#FR-007)).
- **Staleness** — re-run on the same target; it regenerates rather than offering to patch. ([FR-010](./spec.html#FR-010))
