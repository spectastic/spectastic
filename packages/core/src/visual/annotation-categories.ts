/**
 * Where each design-tool annotation category lands (spec
 * 095-visual-element-vocabulary, FR-006, design D-005).
 *
 * The requirement has two halves, and the second carries it: name the
 * categories that have *no* home rather than silently dropping them. An
 * imported annotation whose category has nowhere to go must be visibly
 * unhandled — "we looked and there is no accessibility analogue" is a
 * different statement from "we have never heard of this", and a reader acts
 * differently on each.
 *
 * Data rather than documentation, because a table in a spec answers the first
 * half and cannot answer the second: nothing reads a table. It is a judgment
 * about other people's products and will age.
 *
 * That ageing is a one-line change only where the new category lands somewhere
 * the type ALREADY expresses. Triage T-001 is the counter-example and the
 * reason this paragraph was rewritten: two of the four missing categories
 * needed a home outside the accessibility tree, the union had no variant for
 * one, and no amount of data editing could have added them. So the honest claim
 * is narrower — a new *reason* is one line, a new *kind of home* is a type
 * change and a test change with it.
 *
 * The audit behind it is the visual-spec survey's D-005, which mapped Zeplin's
 * five categories and Figma Dev Mode's four onto existing vocabulary and found
 * five of eight already had a home. `emphasis` is here without appearing in
 * that table: it is a real category in both tools and genuinely has no
 * analogue, so it stays — the table was a summary of where things land, not an
 * exhaustive list of what the tools emit. Recorded because T-001 flagged the
 * asymmetry, and "present but unlisted" is a different finding from "missing".
 */

/** Marker for a category with no accessibility analogue at all. */
export const UNMAPPED = 'unmapped' as const;

/**
 * A category can land in four places, not two. The original union had only
 * `role`, `aria-state` and `unmapped`, which meant the two categories the
 * survey homed OUTSIDE the accessibility tree — motion on the token format's
 * transition types, data on the contract declaration — were structurally
 * inexpressible and fell through as unknown. Triage T-001 found that: four of
 * the survey's eight rows resolved as unknown, and `emphasis` sat in the map
 * without appearing in the survey's table at all.
 *
 * `elsewhere` is the widening. It names a home that exists and is machine-
 * readable, just not in the tree — which is a different statement from
 * `unmapped` ("we looked and there is nowhere") and from `unknown` ("we have
 * never heard of this"). A reader acts differently on each of the three.
 */
export type CategoryEntry =
  | { kind: 'role' }
  | { kind: 'aria-state' }
  | { kind: 'elsewhere'; where: string }
  | { kind: typeof UNMAPPED; reason: string };

export type ResolvedCategory = CategoryEntry | { kind: 'unknown'; name: string };

/**
 * Hand-enumerated. The unmapped entries are PRESENT rather than absent — that
 * is the mechanism, not an oversight.
 */
export const ANNOTATION_CATEGORY_MAP: Readonly<Record<string, CategoryEntry>> = {
  // Maps onto "what is this element".
  role: { kind: 'role' },
  landmark: { kind: 'role' },
  heading: { kind: 'role' },
  order: { kind: 'role' },
  structure: { kind: 'role' },

  // Maps onto "what is it currently doing".
  behaviour: { kind: 'aria-state' },
  state: { kind: 'aria-state' },
  interaction: { kind: 'aria-state' },

  // The accessibility tree itself, which is where the design tools' own
  // accessibility category lands — the same place, named the way they name it.
  accessibility: { kind: 'role' },

  // Homed, but not in the tree. These are the entries T-001 found missing: the
  // survey placed both, and the type could not hold either.
  motion: {
    kind: 'elsewhere',
    where:
      "the token format's own duration, easing and transition types — a declared motion value belongs in the token file, not in a second place able to disagree with it.",
  },
  data: {
    kind: 'elsewhere',
    where:
      'the contract declaration and the contract file it names — the interface a screen calls is already declared, and an annotation should reference it rather than restate it.',
  },
  requirement: {
    kind: 'elsewhere',
    where:
      'the requirement it cites, by identifier. FR-007 forbids restating one, so an imported requirement-class annotation becomes a citation.',
  },

  // No accessibility analogue. Named, with the reason, so an import that
  // carries one of these is reported rather than quietly discarded.
  tracking: {
    kind: UNMAPPED,
    reason:
      'An analytics event is not a property of the interface a user perceives, so the accessibility tree has nothing to say about it.',
  },
  content: {
    kind: UNMAPPED,
    reason:
      'A content budget constrains what may be written, not what the element is or is doing; it stays prose and stays unchecked.',
  },
  emphasis: {
    kind: UNMAPPED,
    reason:
      'Visual emphasis is a presentation choice with no semantic counterpart — the accessibility tree deliberately does not carry it.',
  },
};

/**
 * Resolve a category name. Case-insensitive, because the design tools disagree
 * about casing and an author should not have to know which one they exported
 * from.
 *
 * The three non-`role`/`aria-state` outcomes are deliberately distinct:
 * `elsewhere` has a home outside the tree, `unmapped` has none anywhere, and
 * `unknown` means this map has never heard of the name. Collapsing any two of
 * them would lose the distinction an importer needs to decide whether to
 * translate, to keep as prose, or to report.
 */
export function resolveAnnotationCategory(name: string): ResolvedCategory {
  const entry = ANNOTATION_CATEGORY_MAP[name.trim().toLowerCase()];
  return entry ?? { kind: 'unknown', name };
}
