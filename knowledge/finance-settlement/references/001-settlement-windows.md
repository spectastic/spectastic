---
slug: 001-settlement-windows
origin: Illustrative summary authored for a demo knowledge pack — not a verbatim
  excerpt of any single regulatory text
origin-url: TODO
edition: 2026-07-25
license: CC0-1.0
converter: hand-authored
content-hash: sha256:3b707be1ad8dc8b977df1dd92eace7895b7b014a64bd22f025bc4204f03b5f19
status: not-yet-spot-checked
---

# Settlement windows: trade date vs. settlement date

A securities trade has two dates that matter: the **trade date** (when the buy/sell is agreed) and
the **settlement date** (when cash and securities actually change hands). The gap between them is
the settlement cycle, conventionally written as **T+N** — N business days after the trade date.

## T+1 and T+2

Most developed equity markets settle on a **T+1** or **T+2** cycle as of the mid-2020s: US, Canadian,
and Indian equities moved to T+1; many European markets remained on T+2 pending their own
transitions. The shorter the cycle, the less time counterparty risk has to accumulate between trade
and settlement — the core reason regulators have pushed cycles shorter over decades (T+5 → T+3 → T+2
→ T+1 in the US market's own history).

## Cutover mechanics

A clearing house enforces a daily **cutover time** — the last moment a trade can be submitted for
that day's settlement batch. A trade submitted after cutover rolls to the next settlement cycle,
which matters for anything computing an expected settlement date from a trade timestamp: the
naive "trade date + N business days" arithmetic is wrong for a trade booked after the cutover.

## Common reconciliation exceptions

- **Settlement fails** — the seller doesn't deliver the security (or the buyer doesn't deliver cash)
  by the settlement date. Most markets have a fails-charge or buy-in regime to discourage this.
- **Corporate-action timing collisions** — a dividend record date or a stock split landing between
  trade date and settlement date changes what actually settles; the trade's economic terms are
  adjusted, not just its mechanics.
- **Cross-border settlement mismatches** — a trade between markets on different settlement cycles
  (e.g. a T+1 market and a T+2 market) needs an explicit bridging convention; treating both legs as
  the same cycle is a common and costly bug.
