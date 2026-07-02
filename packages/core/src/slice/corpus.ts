/**
 * Build the in-memory synthetic corpus that hands W-2's hypothetical children to
 * R-002 (spec 029, plan D-003 / FR-002). Each child is serialised to the exact
 * reciprocal link shape `orderCommand` already reads: a `<spec-parent>` for each
 * sibling it depends on, and a reciprocal `defer-to` on each sibling that depends
 * on it. No disk is touched — R-002 orders the strings directly.
 */

import type { CorpusEntry } from '../ordering/types.js';
import type { CandidateChild } from './types.js';

function esc(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

/**
 * Turn candidate children into a `CorpusEntry[]` whose inter-child reciprocity
 * encodes the proposed precedence (a dependency `d → c` means d precedes c). The
 * graph is acyclic by construction provided `dependsOn` is acyclic.
 */
export function buildSyntheticCorpus(children: readonly CandidateChild[]): CorpusEntry[] {
  // Reverse the dependency edges: for each child, which siblings depend on it.
  const dependents = new Map<string, string[]>();
  for (const c of children) {
    for (const d of c.dependsOn) {
      const arr = dependents.get(d) ?? [];
      arr.push(c.specId);
      dependents.set(d, arr);
    }
  }

  return children.map((c) => {
    const parents = c.dependsOn.map((d) => `<spec-parent specid="${esc(d)}"></spec-parent>`).join('');
    const defers = (dependents.get(c.specId) ?? [])
      .map((x) => `<li defer-to="${esc(x)}">precedes</li>`)
      .join('');
    const oos = defers ? `<spec-out-of-scope><ul>${defers}</ul></spec-out-of-scope>` : '';
    const r = c.rice;
    const rice = `<spec-rice reach="${r.reach}" impact="${r.impact}" confidence="${r.confidence}" effort="${r.effort}"></spec-rice>`;
    return {
      specId: c.specId,
      html: `<!doctype html><html><body><h1>${esc(c.title)}</h1>${parents}${oos}${rice}</body></html>`,
    };
  });
}
