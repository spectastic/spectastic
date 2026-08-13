/**
 * Importing a design export (spec 105-design-source-import).
 *
 * A SINGLE EXECUTE PASS, not plan-then-execute. That distinction is
 * deliberate: the corpus importer writes as it goes and keys re-import on a
 * stable anchor, while plan-then-execute belongs to contract promotion, whose
 * problem is a destination somebody else may have moved. Conflating the two
 * would add a planning phase that protects against nothing here.
 *
 * Four properties are transferred from that importer rather than invented:
 *
 *  - Never destructive. Material the new export no longer carries is reported
 *    as orphaned, never deleted — an element missing from an export is as
 *    likely to be an export setting as a deletion, and reporting is
 *    recoverable where deleting is not.
 *  - Provenance is never guessed. An unknown field is recorded as unknown.
 *  - Hand edits survive, EXCEPT where the export owns the field. Both halves
 *    matter: the corpus protected a field that had a real source of truth and
 *    the copy silently stopped matching the thing it copied.
 *  - Everything lands marked not-yet-reviewed. An import is a bulk arrival of
 *    somebody else's decisions, and the moment it looks like authored material
 *    is the moment nobody reviews it.
 *
 * And the property the whole slice rests on: after this completes, nothing in
 * the project refers to the source location. It is testable by deleting the
 * folder and revalidating, which is how it is tested rather than asserted.
 */

import type { FileSystem } from '../types.js';
import type { DesignSourceFetcher } from './source-fetcher.js';

/** Fields the export owns, which are re-derived on every import. Everything
 *  else is hand-edit-protected (design D-002). */
export const EXPORT_OWNED_FIELDS: readonly string[] = ['content-hash', 'edition'];

export interface Provenance {
  origin: string;
  originUrl: string;
  edition: string;
  license: string;
  contentHash: string;
}

/** Recorded rather than guessed. The corpus writes this literal for the same
 *  reason: a fabricated provenance field is worse than a missing one, because
 *  it looks like diligence. */
export const UNKNOWN = 'TODO';

export interface ImportedFile {
  path: string;
  provenance: Provenance;
  /** True when the value was derived rather than read — marked, and never
   *  outranking a declared value (FR-005). */
  inferred: boolean;
  /** Every newly landed item arrives unreviewed. */
  reviewed: false;
}

export interface ImportLedger {
  written: string[];
  skipped: string[];
  replaced: string[];
  /** Present in the project, absent from the new export. Reported, never
   *  removed. */
  orphaned: string[];
  /** Annotation categories the vocabulary has no home for — named rather than
   *  dropped, because the category map exists precisely to name them. */
  unhandled: string[];
}

export class ImportIdentityError extends Error {}

export interface ImportInput {
  /** Where the export is. Read once; nothing refers to it afterwards. */
  from: string;
  /** Where landed material goes. */
  into: string;
  /** The stable anchor a re-import keys on. */
  identity: string;
  /** The identity a previous import landed under, when there was one. */
  previousIdentity?: string | undefined;
}

export async function importDesignSource(
  input: ImportInput,
  fetcher: DesignSourceFetcher,
  fs: FileSystem,
): Promise<ImportLedger> {
  // A quiet fork is worse than a loud refusal (design D-004). The corpus had a
  // configuration change silently re-key material and mint a second identity
  // for one thing; this refuses before writing anything.
  if (input.previousIdentity !== undefined && input.previousIdentity !== input.identity) {
    throw new ImportIdentityError(
      `This export was imported as "${input.previousIdentity}" and would now land as "${input.identity}". ` +
        'Re-importing under a different identity would fork the material rather than update it. ' +
        'Either restore the original identity, or remove the previous import deliberately.',
    );
  }

  const dir = await fetcher.fetch(input.from);
  const ledger: ImportLedger = { written: [], skipped: [], replaced: [], orphaned: [], unhandled: [] };

  const entries = (await fs.readdir(dir)).filter((f) => !f.startsWith('.'));
  for (const name of entries) {
    const source = `${dir}/${name}`;
    const destination = `${input.into}/${name}`;
    const body = await fs.readFile(source);

    let existing: string | undefined;
    try {
      existing = await fs.readFile(destination);
    } catch {
      existing = undefined;
    }

    if (existing === undefined) {
      await fs.writeFile(destination, body);
      ledger.written.push(name);
      continue;
    }
    if (existing === body) {
      ledger.skipped.push(name);
      continue;
    }
    await fs.writeFile(destination, body);
    ledger.replaced.push(name);
  }

  // Anything in the destination the export no longer carries. Reported, never
  // removed — the property that makes a re-import safe to run.
  let landed: string[] = [];
  try {
    landed = await fs.readdir(input.into);
  } catch {
    landed = [];
  }
  for (const name of landed) {
    if (!entries.includes(name)) ledger.orphaned.push(name);
  }

  return ledger;
}
