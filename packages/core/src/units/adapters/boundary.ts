/**
 * Boundary format dispatch (spec 081, FR-002/FR-004).
 *
 * Positive forms first — the ones that *name* their units, and so can answer
 * "where does this go". Where none is found, the negative forms are recognised
 * only well enough to say why they cannot answer: a forbidden-edge list yields
 * a partial order over paths that already exist and is silent by construction
 * about a destination that does not, which is the case a placement question is
 * hardest on.
 *
 * Reads a bounded set of named locations, never a tree walk (NFR-002).
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { BoundaryResult } from '../boundary.js';
import { readImportLinterBoundary } from './boundary-import-linter.js';
import { readNxBoundary } from './boundary-nx.js';

/** Configs that constrain boundaries without naming the units (FR-002). */
const NEGATIVE_FORMS: readonly { file: string; label: string }[] = [
  { file: '.dependency-cruiser.cjs', label: 'dependency-cruiser' },
  { file: '.dependency-cruiser.js', label: 'dependency-cruiser' },
  { file: '.dependency-cruiser.json', label: 'dependency-cruiser' },
  { file: 'archunit.properties', label: 'ArchUnit' },
];

const NEGATIVE_REASON =
  'it declares which dependencies are forbidden rather than naming the units, so it cannot enumerate ' +
  'where a change could go — and says nothing at all about a destination that does not exist yet';

export function detectBoundaryMap(cwd: string): BoundaryResult {
  // A positive map is the map. It is never merged with forbidden edges (FR-004):
  // the two answer different questions, and combining them would present a
  // partial order as if it were an enumeration.
  const nx = readNxBoundary(cwd);
  if (nx !== null) return { kind: 'mapped', map: nx };

  const importLinter = readImportLinterBoundary(cwd);
  if (importLinter !== null) return { kind: 'mapped', map: importLinter };

  for (const form of NEGATIVE_FORMS) {
    if (existsSync(join(cwd, form.file))) {
      return { kind: 'unmapped-by-form', detected: form.label, reason: NEGATIVE_REASON };
    }
  }

  return { kind: 'none' };
}
