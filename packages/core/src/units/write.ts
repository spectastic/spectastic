/**
 * Writing a declared edge (spec 080-unit-edge-authoring, US1).
 *
 * Strict where the reader is soft. `read.ts` degrades to `[]` on every failure,
 * because a malformed config must never crash a read — but a *write* that
 * silently does nothing is worse than one that says no, so every problem here
 * is a refusal carrying its reason.
 *
 * Order of operations is the design (D-002): every refusal is decided before a
 * byte is emitted, so the byte-identical guarantee in NFR-002 is structural.
 * There is no path on which a partial write exists to clean up.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseResourceUri } from '@spectastic/schema/project';
import { addToSet } from '../config/edit.js';

export type WriteEdgeResult = { ok: true; written: boolean } | { ok: false; reason: string };

/**
 * Declare that `self` depends on `target`.
 *
 * `written: false` with `ok: true` means the edge was already declared — the
 * idempotent case, not a failure. Reasons name the offending coordinate rather
 * than a requirement id: the id is provenance for whoever builds the tool, not
 * information for whoever is using it (P-10).
 */
export function writeDeclaredEdge(cwd: string, self: string, target: string): WriteEdgeResult {
  const parsed = parseResourceUri(target);
  if (!parsed.ok) {
    return { ok: false, reason: `"${target}" is not a well-formed coordinate — ${parsed.reason}.` };
  }
  if (target === self) {
    return {
      ok: false,
      reason: `"${self}" cannot depend on itself; a unit is never its own dependency.`,
    };
  }

  // The editor refuses an unparseable or non-array-valued config without
  // touching it, so a `false` here is either "already present" or "refused".
  // Distinguishing them needs the config, which the editor already read — so
  // ask it, rather than reading the file a second time and racing ourselves.
  const added = addToSet(cwd, 'consumes', target);
  if (added) return { ok: true, written: true };

  const declared = readConsumesStrict(cwd);
  if (declared === null) {
    return {
      ok: false,
      reason: `spectastic.json could not be read as an object, or its "consumes" is not a list — refusing rather than overwriting it.`,
    };
  }
  return { ok: true, written: false }; // already declared — idempotent, not an error
}

/**
 * `consumes` as an array, or `null` when the config is unusable.
 *
 * Deliberately not `read.ts`'s reader: that one collapses "no entries" and
 * "unreadable" into `[]`, which is right for a read and wrong here — this
 * caller has to tell an idempotent no-op apart from a refusal.
 */
function readConsumesStrict(cwd: string): string[] | null {
  const path = join(cwd, 'spectastic.json');
  if (!existsSync(path)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const consumes = (parsed as { consumes?: unknown }).consumes;
    if (consumes === undefined) return [];
    if (!Array.isArray(consumes)) return null;
    return consumes.filter((c): c is string => typeof c === 'string');
  } catch {
    return null;
  }
}
