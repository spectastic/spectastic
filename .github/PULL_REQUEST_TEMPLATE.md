## What changed

<!-- Two sentences. The behaviour, not the diff. -->

## What this drains

<!-- One of: a task id (T-NNN) from specs/<id>/tasks.html, an inbox card (I-NNN),
     a triage card, or "none — standalone fix". -->

## Route check

<!-- Non-trivial methodology change? Link the proposal.html authored by /spectastic.propose.
     A raw edit to an accepted spec will be asked to re-route. Delete this section if it
     doesn't apply. -->

## Gates

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm test:coverage && pnpm patch-coverage -- --base=main` — ≥80% of this change's lines
- [ ] `node packages/cli/bin/spectastic validate` is clean on any artifact this touches

## If this flips a spec In Review → Accepted

- [ ] A **named human** reviewer is recorded in the spec's `<spec-meta>` and in its changelog entry

## Authorship

- [ ] No AI as `Author` or `Co-authored-by`. An assisting model is acknowledged as a distinct
      `Assisted-by:` trailer.

## Copy check

- [ ] No competitor framing ("alternative to X", "inspired by Y") and no named individuals in
      shipping copy — see the Voice rule in `CONTRIBUTING.md`
- [ ] No internal artifact ids leaked into user-facing tool copy (help text, error messages, markers)
