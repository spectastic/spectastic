# Reference assets

Drop inspiration images, Figma exports, and screenshots here, then link them from the
[brief](../README.md). Suggested naming: `NN-short-name.png` (e.g. `01-node-graph.png`).

## Seed references (add the image files alongside this note)

### `01-node-graph-*` — interaction model (the n8n / Zapier-style flow editor)
What to take: discrete cards on a **dotted canvas**, **curved connectors**, a compact
**stat-rows** layout per node (label + value pairs, e.g. "Cadence · Every 5 min"), a `⋯` menu
per card, and **branch colouring** at a conditional (one edge per outcome).
What to leave: the **visual language**. It's a dense SaaS builder; spectastic is calm and
editorial. Translate the *pattern*, not the *paint* — see the brief's "Interaction inspiration —
and the trap".

### `02-typography-*` — discipline reminder ("Bad vs Good Typography")
The point: a **clear font hierarchy**, **consistent scaling**, balanced button/label text, and
readable line lengths. Cards must honour this. spectastic already ships a fluid type scale and
four font roles (Fraunces / Source Serif 4 / Lato small-caps / IBM Plex Mono) — use them; don't
invent new sizes.

### `03-lifecycle-canvas.html` — interactive canvas mockup
A self-contained HTML mockup of the lifecycle as a canvas/flow editor. Open it in a browser to
probe the interaction directly (it's the artifact, not a screenshot). Use it to measure spacing,
connector curvature, and node layout against the brief rather than guessing.

## Where the live design system lives (for measuring, not guessing)

- `assets/spec.css` — authoritative tokens: `:root` (light), `[data-mode="dark"]` (dark),
  `--spec-1…8` (the per-verb brand colours).
- `examples/spectastic-spec.html`, `specs/*/spec.html` — real rendered artifacts (what the
  "full webview" fidelity reuses).
- `specs/017-brand-logo/` — the spectrum-asterisk mark and its fixed per-verb colour order.
