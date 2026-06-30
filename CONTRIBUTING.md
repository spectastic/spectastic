# Contributing

Spectastic is at v0.1. The methodology is still reshaping itself, so the contribution surface is intentionally narrow.

## What to do

| You want to … | Route |
| --- | --- |
| Report a bug or sharp edge | Open an issue. |
| Suggest a small, revert-safe change | `/spectastic.triage` it as a list-intake item — one card per change in `inbox.html`. |
| Propose a non-trivial change to the methodology | `/spectastic.propose` against the relevant spec; PR the resulting `proposal.html`. |
| Discuss a direction before authoring anything | Open an issue or a draft PR with the question. |

PRs that bypass `/spectastic.propose` for non-trivial methodology changes will be asked to re-route. The proposal cycle isn't ceremony — it carries the typed deltas, risk register, and migration prose that `/spectastic.apply` depends on.

## Reviewing & accepting

When you flip a spec from **In Review → Accepted**, record *who* reviewed it (per `REQ-LIFECYCLE-004`): name the human reviewer in the spec's `<spec-meta>` **Reviewers** field and in the `<spec-changelog>` entry for that transition. The recorded reviewer is always a human — never an automated agent. The recording shape is yours (a name, a handle, or both, the way `Owner` is written); the rule is that a reviewer is *named*, not the exact format.

This doesn't apply to the **Draft → Accepted** flip — that's you confirming your own completed work, with no separate reviewer to record.

## Voice rule

Spectastic stands on its own. Shipping copy describes the product in its own terms — not as an "alternative to X", not as "inspired by Y", not through named individuals. Canonical links to authoritative sources (RFCs, standards bodies, GitHub Docs, the [data-ink-ratio](https://en.wikipedia.org/wiki/Data-ink_ratio) Wikipedia page) are welcome where they're load-bearing.

The private aesthetic lineage lives in `CLAUDE.md`; the public surface stays principle-first.

## Commit messages

Plain commit messages. No `Co-Authored-By: Claude` or other AI-attribution trailers. If a `Co-Authored-By:` line is warranted (pair work with another human), use the standard format.

## Writing CLI integration tests for AI-using verbs

Tests for AI-using verbs (`triage`, `principles`, `tasks`, `spec`, `plan`, `propose`) use a stub `AIProvider` in CI — never a real LLM. See [`specs/015-ai-stub-injection/spec.html`](./specs/015-ai-stub-injection/spec.html) for the full rationale.

To write a happy-path test:

1. Drop a JSON fixture at `packages/cli/test/fixtures/<verb>-script.json`. The script's shape is `{ chat?: string[], ask?: Record<string,string>[], subagent?: { output: string }[] }`. Methods consume their array sequentially; overflow throws a descriptive error naming the method + call count.
2. In the integration test, set `SPECTASTIC_AI_STUB=<absolute path to fixture>` in the spawned process's env. The CLI's `createAIProvider()` factory routes to `StubAIProvider` instead of `ClaudeProvider` when that env var is set.
3. Assert on the real generated artifact (file contents, exit code, stdout summary). The stub round-trips through the full kernel → renderer → disk path; tests assert on structural shape, not byte-identity.

Worked example: [`packages/cli/test/principles.integration.test.ts`](./packages/cli/test/principles.integration.test.ts) → reads [`packages/cli/test/fixtures/principles-script.json`](./packages/cli/test/fixtures/principles-script.json) and asserts the generated `principles.html` carries the expected `<h3 id="P-N">` anchors + version pill.

A separate `pnpm test:smoke` tier that runs the same tests against real Claude is a deferred slice (`TBD-smoke-tier-tests`); until it lands, real-LLM testing is a hand operation against your local key.

## Expectations pre-1.0

- The slash-command surface (eight verbs) is stable; behaviours within them are not.
- The `<spec-*>` custom-element vocabulary is mostly stable; expect minor renames.
- The CSS design system may shift; class names are not a contract.
- IDs (`REQ-…`, `D-…`, `T-…`) are contracts and survive refactors — see `principles.html` §P-3.

This file will grow as the contribution surface widens at v1.0.
