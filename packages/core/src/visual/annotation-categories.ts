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
 * about other people's products and will age; being data is what makes ageing
 * a one-line change.
 *
 * The audit behind it is the visual-spec survey's D-005, which mapped Zeplin's
 * five categories and Figma Dev Mode's four onto existing vocabulary and found
 * five of eight already had a home.
 */

/** Marker for a category with no accessibility analogue at all. */
export const UNMAPPED = 'unmapped' as const;

export type CategoryEntry = { kind: 'role' } | { kind: 'aria-state' } | { kind: typeof UNMAPPED; reason: string };

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

  // Maps onto "what is it currently doing".
  behaviour: { kind: 'aria-state' },
  state: { kind: 'aria-state' },

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
 */
export function resolveAnnotationCategory(name: string): ResolvedCategory {
  const entry = ANNOTATION_CATEGORY_MAP[name.trim().toLowerCase()];
  return entry ?? { kind: 'unknown', name };
}
