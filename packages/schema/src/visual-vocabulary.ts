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

/** The three element names this vocabulary introduces. */
export const SCREEN_ELEMENT = 'spec-screen';
export const STATE_ELEMENT = 'spec-state';
export const ANNOTATION_ELEMENT = 'spec-annotation';

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
