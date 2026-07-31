# Manual smoke — `/spectastic.explain` (the coach)

The coach is a markdown command that drives the in-session agent; it writes no artifact, so it has no
automated unit test (per [design.html](./design.html) D-001). This checklist is the verification of record for
US1 / US2. It is a **dev aid** — it is not bundled or installed by `spectastic init`.

Run each case in a Claude Code session with the repository open. A case **passes** only if every assertion
holds. Authored before the procedure (T-100), so until `commands/spectastic.explain.md` carries a real
Procedure these all fail.

> Before each run: note the working tree is clean (`git status --porcelain`). After each run, re-check —
> the coach must leave it **byte-identical** ([NFR-001](./spec.html#NFR-001)).

## US1 — grounded explanation on demand

### S1 · Explain a real spec ID (grounded path)
- Run: `/spectastic.explain 015-ai-stub-injection`
- **Assert** an in-chat explanation is produced — no file is written, `git status --porcelain` is empty afterwards. ([FR-001](./spec.html#FR-001), [SC-003](./spec.html#SC-003))
- **Assert** every spec/requirement/decision ID, symbol, and file path it cites actually exists in the repo — open each one and confirm. Zero invented references. ([FR-003](./spec.html#FR-003), [SC-001](./spec.html#SC-001))

### S2 · Explain a requirement / decision / file target
- Run: `/spectastic.explain FR-003` ; `/spectastic.explain D-010` ; `/spectastic.explain packages/cli/src/commands/init/bundle.ts`
- **Assert** each resolves against real source and is explained, grounded in that source. ([FR-002](./spec.html#FR-002))

### S3 · Bogus / unresolvable target (refuse-and-report)
- Run: `/spectastic.explain 099-does-not-exist` ; `/spectastic.explain FR-999`
- **Assert** the coach **reports the miss and stops** — it does NOT fabricate an explanation. ([FR-004](./spec.html#FR-004), [SC-002](./spec.html#SC-002))

### S4 · Ambiguous target (single clarifying question)
- Run a target that resolves to more than one artifact (e.g. an ID that appears in several specs).
- **Assert** the coach asks exactly **one** clarifying question, then proceeds. A target that resolves uniquely is explained one-shot, with no question. ([FR-005](./spec.html#FR-005))

### S5 · Pull-only (not pushed)
- **Assert** the coach runs only when invoked; it is never auto-injected into the output of another command. ([FR-008](./spec.html#FR-008))

## US2 — band-aware coaching depth

### S6 · Default band is `wheels`
- Run: `/spectastic.explain 015-ai-stub-injection` (no `--proficiency`).
- **Assert** the explanation is fully scaffolded — the `wheels` depth. ([FR-006](./spec.html#FR-006))

### S7 · `independent` is terse / skippable
- Run: `/spectastic.explain 015-ai-stub-injection --proficiency=independent`
- **Assert** the explanation is noticeably terser and skippable versus S6; `wheels` is the fullest. ([FR-007](./spec.html#FR-007))

### S8 · Invalid band is rejected
- Run: `/spectastic.explain FR-003 --proficiency=expert`
- **Assert** the coach rejects `expert` against the fixed vocabulary `wheels|completion|independent` — it does not silently fall back. ([FR-006](./spec.html#FR-006))

### S9 · No state read or written
- **Assert** the band takes effect for this invocation only; nothing about proficiency is persisted between runs, and the working tree stays clean. ([NFR-002](./spec.html#NFR-002))

