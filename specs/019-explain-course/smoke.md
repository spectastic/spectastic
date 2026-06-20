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

## Real-LLM quality smoke (needs `ANTHROPIC_API_KEY`, local-only)

Run `/spectastic.explain --course <a real spec>` in a Claude Code session (no stub), letting the agent draft and
the kernel verify against a real model:

- **Grounding** — open every cited ID/path in the course; all resolve to real source, none invented. ([SC-001](./spec.html#SC-001))
- **Unguessability** — pick a quiz and try to answer it without reading the source; you shouldn't be able to. The kernel should already have rejected any it could answer blind. ([SC-002](./spec.html#SC-002))
- **Shape** — ≤7 objectives ([NFR-001](./spec.html#NFR-001)); no streaks/badges/XP ([FR-008](./spec.html#FR-008)); each objective has a Read, an MCQ, and an ungraded teach-back ([FR-005](./spec.html#FR-005), [FR-007](./spec.html#FR-007)).
- **Staleness** — re-run on the same target; it regenerates rather than offering to patch. ([FR-010](./spec.html#FR-010))
