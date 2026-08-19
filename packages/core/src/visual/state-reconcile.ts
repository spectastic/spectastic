/**
 * The pure comparator (spec 107-visual-design-brief, T-210, FR-004,
 * design D-006).
 *
 * Declared state ids in, observed labels in, an undeclared-label report out.
 * Pure and synchronous — no filesystem, no writer. FR-004's "no declaration
 * is written on its behalf" is structural here rather than a discipline: the
 * function has no writer to call (design.html D-006's own Consequences).
 *
 * Grounded on why this is NOT called from the import path: 106's own spike
 * found a design export carries template placeholders until a browser
 * executes it (4 labels statically, 22 after execution), and the importer
 * parses no state at all — so a static caller would report a template
 * placeholder as a discovered state. This is called from the render path
 * instead (T-211), where real, post-execution labels exist.
 */

/**
 * Every observed label that matches no declared state id, each reported
 * once regardless of how many times it was observed. A declared state that
 * was never observed this run is not reported — that is a coverage
 * question, not FR-004's concern.
 */
export function undeclaredStates(declaredIds: string[], observedLabels: string[]): string[] {
  const declared = new Set(declaredIds);
  const seen = new Set<string>();
  const undeclared: string[] = [];
  for (const label of observedLabels) {
    if (declared.has(label) || seen.has(label)) continue;
    seen.add(label);
    undeclared.push(label);
  }
  return undeclared;
}
