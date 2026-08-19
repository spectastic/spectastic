import { describe, expect, it } from 'vitest';
import { undeclaredStates } from '../src/visual/state-reconcile.js';

/**
 * The pure comparator (107-visual-design-brief, T-200, FR-004, design D-006).
 *
 * Declared state ids in, observed labels in, an undeclared-label report out.
 * Pure and synchronous — no filesystem, no writer to call, which is what
 * makes FR-004's "no declaration is written on its behalf" structural rather
 * than a discipline (design.html D-006's own Consequences).
 */

describe('undeclaredStates (107 FR-004)', () => {
  it('reports an observed label matching no declared state, by name', () => {
    const report = undeclaredStates(['empty', 'loading', 'converted'], ['empty', 'converted', 'same-currency']);
    expect(report).toEqual(['same-currency']);
  });

  it('reports nothing when every observed label matches a declared state', () => {
    const report = undeclaredStates(['empty', 'loading'], ['empty', 'loading']);
    expect(report).toEqual([]);
  });

  it('does not report a declared state that was simply never observed this run', () => {
    // FR-004 governs what a DESIGN returns, not what a render captured —
    // a declared-but-uncaptured state is not this function's concern.
    const report = undeclaredStates(['empty', 'loading', 'offline'], ['empty']);
    expect(report).toEqual([]);
  });

  it('reports each undeclared label once even if observed more than once', () => {
    const report = undeclaredStates(['empty'], ['same-currency', 'same-currency']);
    expect(report).toEqual(['same-currency']);
  });

  it('is pure — the same inputs always produce the same output, and it takes no writer', () => {
    const a = undeclaredStates(['empty'], ['ghost']);
    const b = undeclaredStates(['empty'], ['ghost']);
    expect(a).toEqual(b);
    // Structural: the function's own arity has no fs/writer parameter for a
    // caller to accidentally wire up.
    expect(undeclaredStates.length).toBe(2);
  });
});
