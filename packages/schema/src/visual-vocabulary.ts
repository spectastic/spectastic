/**
 * Shared vocabulary for the screen elements (spec 095-visual-element-vocabulary).
 *
 * Cloned from `visual-shared.ts`, which holds the same thing for the design's
 * declaration: the tokens both the rules and the stylesheet must agree on, in
 * one place so they cannot drift apart silently.
 */

/**
 * How a state came to exist (095, FR-002).
 *
 * Three values rather than a boolean, because the middle one is real: a state
 * derived from a *field* of a contract — a timestamp going stale — is neither
 * derived from a response nor authored out of nothing, and a flag would force
 * it to lie in one direction.
 */
export const RECOGNISED_STATE_SOURCES = ['derived', 'field', 'authored'] as const;
export type StateSource = (typeof RECOGNISED_STATE_SOURCES)[number];

/** Sources that name where they came from, and must therefore carry `from=`. */
export const SOURCES_REQUIRING_ORIGIN: readonly StateSource[] = ['derived', 'field'];

/**
 * Accessibility roles that carry a state worth declaring (095, FR-005).
 *
 * Deliberately short and deliberately not the full ARIA role set: this is the
 * list where "and what is it currently doing" is a meaningful question, which
 * is what an annotation's `aria-state` answers. A role outside this list is
 * legal and simply carries no state — see the design's D-003 for the ceiling
 * that a mistyped role is not caught here.
 */
export const ROLES_WITH_STATE: readonly string[] = [
  'checkbox',
  'radio',
  'switch',
  'button',
  'textbox',
  'combobox',
  'listbox',
  'option',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'treeitem',
];

/**
 * Accessibility states an annotation may declare.
 *
 * Every one of these is queryable by the Playwright installed in this
 * repository — `getByRole` takes `checked`, `disabled` and `expanded` as
 * options, and `toMatchAriaSnapshot` serialises the rest — which is what makes
 * a declared annotation an assertion rather than a note (design D-003).
 */
export const RECOGNISED_ARIA_STATES: readonly string[] = [
  'checked',
  'disabled',
  'expanded',
  'selected',
  'pressed',
  'invalid',
  'busy',
  'required',
  'readonly',
];

/**
 * The layers an annotation may belong to (095 FR-012, applied change
 * 2026-08-13-annotate-the-element).
 *
 * The survey held the exemplar's seven layers up and kept *the axis, not the
 * number*, expressing it as a grouping over the accessibility type system
 * rather than as a tenth taxonomy. This is that list. It lives here rather than
 * beside the design-tool category map in `@spectastic/core` for a dependency
 * reason and not a taste one: core imports schema and never the reverse, so a
 * single shared list can only live on this side. The map imports it, which is
 * what keeps the authored vocabulary and the import landing-place one list.
 */
export const RECOGNISED_LAYERS: readonly string[] = [
  'structure',
  'behaviour',
  'requirement',
  'motion',
  'data',
  'accessibility',
  'tracking',
  'content',
  'emphasis',
];

/**
 * The layers an annotation's own typing implies — a SET, not a single value.
 *
 * A set because an annotation may be typed more than one way at once: a control
 * with a role that also cites a requirement is legitimately structural *and*
 * requirement-class, and collapsing that to one answer by precedence would
 * manufacture a disagreement out of an annotation that is simply both. The
 * check that consumes this asks whether a declared layer is IN the set, so an
 * empty set (nothing implies a layer) permits any declaration — which is the
 * case for the categories with no accessibility analogue at all.
 */
export function impliedLayers(a: {
  role?: string | undefined;
  ariaState?: string | undefined;
  cites?: string | undefined;
}): Set<string> {
  const out = new Set<string>();
  if (a.ariaState !== undefined && a.ariaState !== '') out.add('behaviour');
  if (a.role !== undefined && a.role !== '') out.add('structure');
  if (a.cites !== undefined && a.cites !== '') out.add('requirement');
  return out;
}

/** The three element names this vocabulary introduces. */
export const SCREEN_ELEMENT = 'spec-screen';
export const STATE_ELEMENT = 'spec-state';
export const ANNOTATION_ELEMENT = 'spec-annotation';

/**
 * A captured image, bound to the cell of the grid it is evidence of
 * (099-visual-embedded-view, FR-008).
 *
 * Named rather than embedded: the artifact content policy permits
 * `img-src 'self'`, so a same-origin file reference costs no bytes, has no
 * drift surface and adds nothing to the artifact's size — while a `data:` URI
 * in `src=` is an error-severity violation. That is the one place the visual
 * view legitimately diverges from the contract view it otherwise clones, where
 * opaque text leaves no choice but to copy.
 *
 * Position carries the state (a render nested in a state is evidence of that
 * state) and `contexts=` carries the rest of the cell, in the same
 * `axis=context` grammar `<spec-same>` and `<spec-visual contexts=>` use.
 */
export const RENDER_ELEMENT = 'spec-render';

// --- the variant grid (spec 096-visual-variant-grid) -------------------------

/** The four elements the grid introduces. */
export const GRID_ELEMENT = 'spec-variant-grid';
export const AXIS_ELEMENT = 'spec-axis';
export const CONTEXT_ELEMENT = 'spec-context';
export const BASELINE_ELEMENT = 'spec-baseline';
/** A combination examined and found not to differ (096, FR-006). */
export const SAME_ELEMENT = 'spec-same';

/**
 * What an axis may select (096, FR-002).
 *
 * `values` alone would let an axis describe the colours of a television
 * interface and nothing about how it is operated — a focus-driven remote and a
 * pointer are different interaction models, not different palettes.
 */
export const RECOGNISED_AXIS_SELECTS = ['values', 'structure', 'interaction'] as const;
export type AxisSelects = (typeof RECOGNISED_AXIS_SELECTS)[number];

/** The value a baseline uses to say it has never been verified (096, FR-005). */
export const NEVER_VERIFIED = 'none';

// --- components (spec 097-visual-component-lifecycle) ------------------------

export const COMPONENT_ELEMENT = 'spec-component';

/**
 * Scope is BINARY (097, FR-001, design D-002).
 *
 * A third value naming "two features share it" was considered and refused:
 * nothing could decide when that scope becomes project, so the tool would have
 * added a state it cannot transition. The second use is recorded as evidence
 * on `used-by` instead, which makes the rule of three visible to a person
 * without the tool acting on it.
 */
export const COMPONENT_SCOPES = ['feature', 'project'] as const;
export type ComponentScope = (typeof COMPONENT_SCOPES)[number];

/** Where a component came from (097, FR-006). */
export const COMPONENT_ORIGINS = ['authored', 'vendored', 'consumed'] as const;
export type ComponentOrigin = (typeof COMPONENT_ORIGINS)[number];

/**
 * Maturity is the project's EXISTING status vocabulary (097, FR-005).
 *
 * Not a mapping onto it and not a synonym for it. The field's usual ladder —
 * experimental, beta, stable, deprecated — lands on draft, review, accepted,
 * deprecated, and every one of these six is already styled by the stylesheet.
 * A seventh value here would be the parallel vocabulary the requirement
 * forbids, so a test asserts this list and the styled set stay identical.
 */
export const COMPONENT_MATURITIES = ['draft', 'review', 'accepted', 'superseded', 'deprecated', 'blocked'] as const;
export type ComponentMaturity = (typeof COMPONENT_MATURITIES)[number];

/** Provenance a vendored component must record (097, FR-008) — the corpus's field set. */
export const VENDORED_PROVENANCE_ATTRS = ['origin-url', 'edition', 'license'] as const;

// --- token set versioning (spec 098-token-set-versioning) --------------------

export const TOKEN_SET_ELEMENT = 'spec-token-set';
export const RELEASE_ELEMENT = 'spec-release';

/**
 * The closed change-class set (098, FR-005) — the three bump tiers themselves.
 *
 * Not a second vocabulary mapped onto the tiers: FR-009 already speaks in
 * tiers ("classified at the highest tier of the bump policy"), and the policy
 * prose in the artifact already says what each one means. A parallel set of
 * impact words would describe a release better and would need keeping
 * consistent with these forever.
 *
 * Every surface renders it as the PRODUCER'S CLAIM. Breaking-change detection
 * is mature for API contracts and effectively absent for design tokens —
 * hundreds of classified rules on one side, a single diffing plugin on the
 * other — so presenting the class as verified would assert something no
 * mechanism establishes.
 */
export const CHANGE_CLASSES = ['major', 'minor', 'patch'] as const;
export type ChangeClass = (typeof CHANGE_CLASSES)[number];

/** The tier a removal must be classified at (098, FR-009). */
export const HIGHEST_TIER: ChangeClass = 'major';
