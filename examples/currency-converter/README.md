# currency-converter — a worked visual-spec exemplar

A speculative downstream project: a small iPhone currency converter that calls a rates API,
with iPad and macOS variants and tvOS explicitly declined.

**Nothing here is a shipped spectastic capability.** The lifecycle artifacts (`spec.html`,
`design.html`, `tasks.html`, `verify.html`) use vocabulary that exists today. Everything under
`visual/`, the design's *Visual surface* section, and `visual.html` illustrate a capability
that has only been surveyed — see
[`docs/visual-spec-considerations.html`](../../docs/visual-spec-considerations.html) and the
slugs it plants: `TBD-design-visual-section`, `TBD-visual-sidecar-convention`,
`TBD-visual-spec-vocabulary`, `TBD-visual-annotation-schema`, `TBD-fidelity-measurement`,
`TBD-token-set-versioning`, `TBD-platform-baseline-declaration`.

## What this exemplar exists to demonstrate

1. **Screen states fall out of the API contract — as a floor, not a ceiling.** Six error
   responses in `contracts/rates.openapi.yaml` become required states. Five more (`empty`,
   `loading`, `offline`, `stale-cache`, `cold-start`) have no HTTP status and must be authored.
   The mapping from response to state is many-to-one and is itself a decision.
2. **Variants are an axis grid, not four documents.** `visual/variants.json` crosses mode ×
   platform × size class. tvOS is declined *with a reason* rather than left missing.
3. **Three clocks.** The token set carries a semver version with forward-only binding; the
   spec carries a change log and no version; the captured renders carry a ratification date and
   no version at all.
4. **The platform is a fourth clock nobody owns.** Each platform context declares the OS version
   it was designed against and the one it was last verified against.

## Why there is a `visual.html` and not a `handoff.html`

The survey scored four options for where a visual spec lives and rejected **a ninth verb emitting
its own artifact per screen** (15) in favour of **the chassis contracts already use** (23): the
design declares, a sidecar holds the real thing, and a view is materialised from both and
drift-checked. D-001 ends *"No ninth verb."*

That rejects a *verb*, not a *view* — a generated view is the third leg of the option that won, and
is exactly what spec 072 already does for an embedded contract. `visual.html` is that leg. An
earlier draft of this exemplar called it `handoff.html`, which was the name the survey attached to
the option it turned down, and reading the two together it looked as though the ninth verb had been
reinstated by the back door. Renamed for what it shows, matching the `visual/` sidecar and the
design's *Visual surface* section. Nothing here implies a `/spectastic.handoff`.

The survey's other objection to the exemplar it was surveying — that **one file per screen**
generalises badly — is honoured too: this file is per *spec*, like `verify.html`, and covers every
screen that spec touches. It has one screen today because the spec has one.

## Two honest limitations of the example

- **The renders are inline SVG, not raster exports.** SVG diffs, validates, and themes off the
  design tokens, which suits a repository of text artifacts. A real project's renders would be
  PNG exports from its design tool. The substitution is a convenience here, not a recommendation.
- **`visual.html` cannot embed a live surface.** `<iframe>` is an error-severity
  `no-executable-content` violation and the artifact CSP is deny-by-default, so the view
  materialises a static render instead. That constraint is real and applies to any future
  implementation.

## Layout

```
spectastic.json                     project identity and profile
principles.html                     standard-tier constitution, semver, forward-only binding
contracts/rates.openapi.yaml        the EFFECTIVE contract (the promoted location)
visual/                             PROJECT-scoped — one design system, shared by every feature
  tokens/base.tokens.json           DTCG primitives
  tokens/light.tokens.json          mode context
  tokens/dark.tokens.json           mode context
  variants.json                     the axis grid, and the token-set version
specs/001-currency-conversion/
  spec.html design.html tasks.html verify.html
  contracts/rates.openapi.yaml      the PROPOSED contract
  visual/converter.screen.json      FEATURE-scoped — screens, states, annotations
  visual.html                       the generated visual view
```

## Two scopes, and why

The token set and the axis grid are **project-scoped**; the screen inventory is **feature-scoped**.
That split is not cosmetic. A contract has exactly one owning feature, which is why spec 070 puts it
beside the spec. A design system has none — every feature shares it — so N designs each naming "the
token set" would be N declarations of one thing, with nothing saying which wins when they disagree.
This repository has already paid for that shape once: `declaredInterfaceState` in
`packages/core/src/enforce/detect.ts` carries the comment *"Declarations ACCUMULATE rather than
shadow"*, a fix for a per-feature declaration being read as project-wide posture. A union is the
right answer for contracts and the wrong one for a design system.

An earlier draft of this exemplar put everything at the project root while the survey's D-001 said
"beside the spec". Neither was right, and an adversarial review caught that the exemplar had silently
invented the split rather than declaring it. Both artifacts now say the same thing.

## The name

`visual/` is this exemplar's choice, not a settled convention — `TBD-visual-sidecar-convention` owns
the decision. `references/` belongs to the knowledge corpus and `contracts/` to spec 070, so a third
name was needed, and two obvious candidates were rejected on evidence. **`surface/`** collides with
the most-used vocabulary in modern design systems: Material Design 3 defines three surface colour
roles and five surface containers, Compose ships a `Surface` composable, spectastic's own stylesheet
uses `--c-surface` 44 times, and this exemplar defines a `color.surface` token — which under the old
name lived inside a directory called `surface/`. **`views/`** is worse in the platforms this app
targets: in SwiftUI every element is a `View` and the convention is `SettingsScreen.swift` for a
screen against `BasicRowView.swift` for a component, so `views/` reads as the component library. It
also inverts spectastic's own usage, where a "view" is a *generated* artifact — `verify-view-stale`,
`contract-view-drift`, and 81 files describing themselves as "a derived view".

## A third limitation, found by building this

A `<spec-contract path=…>` is resolved against the directory `spectastic validate` was invoked in.
This project is nested inside another one, so a realistic `contracts/rates.openapi.yaml` cannot
resolve when the check runs from the outer repository root. `design.html` therefore declares the
path repo-relative and says so inline. It is the one place the exemplar cannot be both realistic
and validated at the same time, and it is a property of nesting a project inside a project rather
than a defect in the check.

## `verify.html` was generated, then edited twice

It was produced by piping a capture into the real `spectastic verify`, run from this directory —
the SC → acceptance → test-task trace below it was resolved from the bundle rather than written,
which is why `SC-003` shows a loud gap and `NFR-001` shows an unlinked-SLO gap. Two edits were
applied afterwards, both forced by nesting: the asset paths (`../../assets/` → `../../../../assets/`,
because a nested project borrows the outer repository's assets) and the illustrative banner. A
regeneration would drop both. It is the one artifact here that cannot be marked speculative without
becoming stale.

## What building this exposed: cross-file rules assume one project

The plan for this exemplar was to widen every `examples/*.html` glob to `examples/**/*.html` so
the bundle would be covered. That turned out to be wrong, in three places at once, for one reason:
**a cross-file rule given two projects' `specs/` trees answers a question about neither.**

- `spec-id-unique` collided this project's `001-currency-conversion` with the outer repository's
  `001-cli` — two different projects, both numbering from 001, which is correct behaviour for both.
- `verify-view-missing` derives its convention floor from *the lowest spec number that already
  carries a `verify.html`*. This project's `001-.../verify.html` reset the outer repository's floor
  from 021 to 1, and twenty pre-convention specs immediately reported a missing verify view.
- The performance benchmark globs `examples/**/*.html`, so the same collision made
  `validate-full-project` exit non-zero and the bench read it as a blown budget.

The resolution is not to widen: a nested project is validated **as its own set**, which is the only
reading of a cross-file rule that is correct for either project. `packages/schema/test/integration.test.ts`
does that, and the per-file security scan — which has no cross-file rules and therefore no
contamination — is the one glob that was widened.
