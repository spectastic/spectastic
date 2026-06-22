# Design brief — VS Code "Lifecycle" canvas

> Handoff for the design team. Reference assets (inspiration images, Figma exports,
> screenshots) live in [`./references/`](./references/). This brief could later seed a
> `020-vscode-extension` spec, but it's design-ideation first.

## What we're designing

An in-editor panel for the spectastic VS Code extension: a **canvas of connected cards**,
one per lifecycle artifact, that lets an author see the whole `spec → … → triage` flow at a
glance and click through to the full rendered document. Three fidelity levels:
**minimal node → compact card → full webview**.

## Product context (read first)

spectastic is single-file-HTML spec tooling with a deliberately **calm, editorial** visual
identity — warm cream surfaces, serif-led typography, generous whitespace, status conveyed by
small pills, *data-ink-ratio* discipline (nothing on screen that doesn't carry meaning). The
artifacts themselves (`spec.html`, `plan.html`, …) are **already designed**; the full webview
reuses that system as-is. What's new is the **canvas** and the **cards**.

## The model — what nodes and edges mean

Each **node = one artifact file** in the lifecycle:

```
principles → spec → plan → tasks → implement → propose → apply → triage
```

…plus branches: a spec can have **child slices** (parent/child); a **proposal** branches off a
spec and rejoins via *apply* or peels off via *withdraw*; **triage** loops back to spec/plan/impl;
the **inbox** small-batch loop feeds *implement*. Edges carry that flow; branch points
(accepted vs withdrawn; tasks done vs remaining) are where colour earns its place — the way the
node-graph reference's `Conditional` node forks.

**Node "health" replaces the reference's "Last run / Duration" stats** with spectastic state —
see the [appendix](#appendix--per-verb-colour--health-fields) for exact fields.

## The three fidelities

1. **Minimal node** (default on canvas): verb icon + title (spec id / name) + status pill +
   **one** key metric. Glanceable; many fit on screen. The resting state.
2. **Compact card** (hover / selected): adds 3–5 health rows + a `⋯` menu (open · validate ·
   run next verb). The reference's expanded node is the density target — *but calmer*.
3. **Full webview**: opens the real rendered artifact in spectastic's existing design system.
   The payoff — "the document is the artifact."

## Visual constraints — use the real tokens

Non-negotiable: the canvas must read as spectastic, themed for the editor. Light / dark:

| Role | Light | Dark |
| --- | --- | --- |
| Page | `#f6f5f1` | `#1c1b18` |
| Card surface | `#fcfbf7` | `#24221f` |
| Inset / hunk | `#efece4` | `#2c2a26` |
| Body text | `#353534` | `#c2bfba` |
| Metadata / muted | `#73706d` | `#a09d97` |
| Border (1px hairline) | `#e3e3e0` | — |

- **Accents:** crimson `#5f023e` (links/primary), sea-blue `#04a5bb`, purple `#7558b2`,
  salmon `#e1624f`, gold `#ffd09c`.
- **Status pills** (filled, near-white text `#faf7f3`): accepted/ok `#00758f`; must/should/may
  family `#c0432f / #6a4fa0 / #5f5c57`. Status vocabulary: `draft · review · blocked · accepted ·
  superseded · deprecated · withdrawn`.
- **Type roles (use them correctly):** **Fraunces** (serif) for titles; **Source Serif 4** for
  prose; **Lato small-caps** for metadata *labels* (the equivalent of the reference's "Cadence /
  Last run"); **IBM Plex Mono** for ids/paths/code.
- **Spacing:** 8px-derived scale (`0.25 / 0.5 / 0.75 / 1 / 1.5 / 2 rem …`).
- **Type discipline:** one clear hierarchy per card, consistent scale, don't crowd labels (see
  the typography reference). spectastic already has a fluid scale — pull from it; introduce no
  new sizes.

All tokens are authoritative in `assets/spec.css` (`:root` for light, `[data-mode="dark"]` for
dark). Don't eyeball — copy them.

## Interaction inspiration — and the trap

The node-graph reference (`references/`) is the **interaction** model only: discrete cards,
curved connectors, compact stat-rows, branch colouring, a dotted canvas. **Do not import its
visual language** — it's a dense SaaS flow-builder; ours is a calm editorial surface. The
hardest, most valuable part of this brief is expressing a node graph in spectastic's warm,
low-chrome voice. **If it ends up looking like n8n/Zapier, it's wrong.**

## Figma deliverables

1. **The canvas** — layout/auto-layout (lifecycle is mostly linear L→R with lanes for slices /
   proposals), dotted background, edge style incl. branch points (accept/withdraw, done/remaining).
2. **Minimal node** — default + states: hover, selected, **needs-attention** (over budget / open
   questions / blocked), stale.
3. **Compact card** — expanded fields + the `⋯` action menu.
4. **Light and dark**, both legible at small sizes (editor real estate is tight).
5. **Empty / first-run** state and a realistic "one spec, mid-lifecycle" state.
6. The **affordance into the full webview** (how a node opens the rendered doc).

## Out of scope (don't design — it exists or it's native)

- The full rendered artifact (already designed — `assets/spec.css`).
- Validation squiggles / problems panel (native VS Code Diagnostics API).

## Open questions for the team

- **Theming:** mirror spectastic's own light/dark, or follow the user's active VS Code theme
  using our accent palette? (Lean: follow VS Code surface, keep our accents + pills.)
- How much health belongs on a *minimal* node before it stops being calm? (data-ink ratio is the
  referee.)
- Auto-layout (dagre-ish) vs free positioning the author arranges?

---

## Appendix — per-verb colour + health fields

The brand mark assigns each verb a **fixed colour** (the asterisk's 8 prongs, clockwise from
"up"). Per `017-brand-logo`: *"the order and colours MUST NOT be shuffled, recoloured, or dropped
to fit a palette."* Use this sequence to colour-code node types. Dark mode uses a brightened set
(`assets/spec.css` `[data-mode="dark"] --spec-*`).

| Node | Brand colour (light) | Token | Health fields on the card |
| --- | --- | --- | --- |
| **principles** | `#5f023e` | `--spec-1` | status · version · # principles · last amended |
| **spec** | `#960462` | `--spec-2` | status pill · # reqs (FR+NFR+SC) · budget band (green/amber/red) · open-questions count · smallest-demoable · updated |
| **plan** | `#e1624f` | `--spec-3` | status · # decisions · principles-check (ok / exception / violation) · estimability blockers |
| **tasks** | `#e0a23c` | `--spec-4` | done / total · # parallel `[P]` · phase progress |
| **implement** | `#3f6a37` | `--spec-5` | last task ticked · remaining count (often folds into the tasks node) |
| **propose** | `#04a5bb` | `--spec-6` | status · # deltas (by op) · # risks (identified / mitigated) · → **apply** / **withdraw** branch |
| **apply** | `#00758f` | `--spec-7` | resolution of a proposal — archived / withdrawn (often the propose→apply edge, not its own node) |
| **triage** | `#7558b2` | `--spec-8` | # cards · layer breakdown · regen pass / fail |
| *inbox* (small-batch) | — | — | # cards · just-do / defer / done / rejected counts |

**Needs-attention signals** (drive the node's attention state): budget **red**, any open
`<spec-question>`, `blocked` status, unresolved risk `identified`, or a failing regen. These are
the "this node wants you" cues — keep them quiet until they fire (data-ink ratio).
