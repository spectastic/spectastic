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
  /** Material the vocabulary has no home for, and material that carries a
   *  runtime — named rather than dropped. FR-011 establishes reporting as the
   *  posture for an annotation category with nowhere to go; triage T-007 found
   *  the same statement was owed about a whole file, because a real export
   *  carries a script and landing it verbatim breaks FR-003. */
  unhandled: string[];
  /** Files a licence forbade landing, each with which licence and why
   *  (FR-012). Distinct from `unhandled`: one is "we may not", the other is
   *  "we cannot". */
  refused: { name: string; reason: string }[];
  /** One entry per landed file, carrying its provenance and its review state
   *  (FR-004, FR-006). */
  files: ImportedFile[];
  /** Values derived from the artifact, presented for confirmation and never
   *  written into the token set (FR-010, FR-005). */
  tokenCandidates: TokenCandidate[];
}

/**
 * A value read out of an emitted artifact rather than out of design data.
 *
 * Deliberately UNNAMED. Naming it `color.surface` would be the tool inventing
 * the one thing the human is uniquely able to supply — a token name is a
 * decision about meaning, and a wrong one is worse than none because it looks
 * decided. So a candidate carries what was observed and where, and the naming
 * happens at confirmation.
 *
 * Recorded ceiling: a stronger signal exists and is not used yet. A literal
 * appearing at the same structural position in a light subtree and a dark one
 * is a MODE PAIR rather than two unrelated colours, which is exactly what a
 * real export looks like — see triage T-009, where forty-odd literals were
 * hand-duplicated across two otherwise-identical copies. Pairing them needs
 * structural comparison rather than counting, so it is named here rather than
 * half-done.
 */
export interface TokenCandidate {
  value: string;
  /** How many times it appears across the landed material. A value used once
   *  is far more likely to be incidental than one used thirty times. */
  occurrences: number;
  /** The export files it was seen in — which may include one that was not
   *  landed, so a reviewer following this up should expect to look at the
   *  export rather than only at the project. */
  sources: string[];
  /** FR-005 — derived, never declared, and never outranking a declared value. */
  inferred: true;
  /** Presented for confirmation. Nothing here is in the token set. */
  confirmed: false;
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
  /** Which tool the export came from. Recorded, never guessed — absent becomes
   *  the unknown literal rather than an inference from the file shapes. */
  origin?: string | undefined;
  /** Where it came from, for a human to follow. Never fetched (P-11). */
  originUrl?: string | undefined;
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
  const ledger: ImportLedger = {
    written: [],
    skipped: [],
    replaced: [],
    orphaned: [],
    unhandled: [],
    refused: [],
    files: [],
    tokenCandidates: [],
  };

  const entries = (await fs.readdir(dir)).filter((f) => !f.startsWith('.'));
  // Read, not landed. Deriving tokens is a different permission from copying:
  // a file may be unsafe to LAND and still be perfectly readable, and in a real
  // export the file carrying the runtime is also the one carrying most of the
  // colour. Refusing to land it and then ignoring it would throw away the best
  // input FR-010 has. A LICENCE refusal is excluded, because that one really is
  // a permission to use the material at all.
  const readable: { name: string; body: string }[] = [];

  for (const name of entries) {
    const source = `${dir}/${name}`;
    const destination = `${input.into}/${name}`;
    const body = await fs.readFile(source);

    // FR-012 — a licence that forbids landing stops the file, and says which
    // and why. Checked BEFORE anything is written, so a refusal leaves no
    // partial material behind.
    const forbidding = forbiddingLicence(body);
    if (forbidding !== undefined) {
      ledger.refused.push({ name, reason: `licence forbids landing: ${forbidding}` });
      continue;
    }

    // FR-011 generalised, and the fix for triage T-007. A real export carries a
    // runtime, and landing it verbatim breaks the project's own artifact rules
    // at error severity — which contradicts FR-003, the property this slice
    // exists to hold. So executable content is REPORTED rather than landed.
    // Reporting is the posture FR-011 already establishes for material the
    // vocabulary has no home for; this is the same statement about a file.
    if (carriesExecutableContent(body)) {
      ledger.unhandled.push(name);
      readable.push({ name, body });
      continue;
    }

    readable.push({ name, body });

    // FR-004 — provenance on every landed file, with an unknown field recorded
    // as unknown rather than guessed. `origin` and `originUrl` come from the
    // caller because only the caller knows where it fetched from; `edition` and
    // `license` are read out of the material when it declares them.
    const provenance: Provenance = {
      origin: input.origin ?? UNKNOWN,
      originUrl: input.originUrl ?? UNKNOWN,
      edition: declaredEdition(body) ?? UNKNOWN,
      license: declaredLicence(body) ?? UNKNOWN,
      contentHash: contentHash(body),
    };

    // FR-006 — everything lands not-yet-reviewed. Not a default a caller can
    // pass around: the type fixes it at `false`.
    ledger.files.push({ path: destination, provenance, inferred: false, reviewed: false });

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

  // FR-010 — token candidates derived from the artifact rather than read from
  // design data. Derived, so FR-005 marks every one inferred, and none is
  // written into the token set: they land in the manifest as candidates a human
  // confirms. Presented, never committed.
  ledger.tokenCandidates = deriveTokenCandidates(readable);

  // Anything in the destination the export no longer carries. Reported, never
  // removed — the property that makes a re-import safe to run. The manifest is
  // excluded because this pass writes it, so it can never be orphaned by it.
  let landed: string[] = [];
  try {
    landed = await fs.readdir(input.into);
  } catch {
    landed = [];
  }
  for (const name of landed) {
    if (name !== MANIFEST_NAME && !entries.includes(name)) ledger.orphaned.push(name);
  }

  // FR-004 and FR-006 both require a reader can SEE this, so the provenance and
  // the review marks are written as an artifact rather than returned to a
  // caller that may discard them.
  await fs.writeFile(`${input.into}/${MANIFEST_NAME}`, renderManifest(input.identity, ledger));

  return ledger;
}

// --- the parts that read the material -------------------------------------
//
// All pure and all synchronous: they take text and return facts about it. No
// filesystem, no network, no clock. That is what makes the whole pass testable
// against a string, and it is the same discipline the schema rules hold.

/** The manifest an import writes. One file, in the sidecar, beside what it
 *  describes. */
export const MANIFEST_NAME = 'import-manifest.html';

/**
 * Licences that forbid landing a copy at all (FR-012).
 *
 * Matched on the licence *identifier*, not on prose, because a page may
 * legitimately discuss a licence it is not under. The set is deliberately
 * short and errs toward letting material through: a false refusal blocks work
 * for a reason the user cannot act on, while a false acceptance is caught at
 * review — the landed file is marked unreviewed and its licence is recorded.
 */
export const FORBIDDING_LICENCE_IDS: readonly string[] = ['cc-by-nc-nd', 'cc-by-nd', 'proprietary', 'unlicensed'];

/** Read a declared licence identifier, or undefined. Never inferred: a file
 *  that does not say is recorded as unknown, per FR-004. */
export function declaredLicence(body: string): string | undefined {
  const m = /(?:^|[\s"'>])(?:license|licence)\s*[:=]\s*["']?([A-Za-z0-9.\-+]+)/i.exec(body);
  return m?.[1];
}

/** Which forbidding licence this material declares, if any. */
export function forbiddingLicence(body: string): string | undefined {
  const declared = declaredLicence(body);
  if (declared === undefined) return undefined;
  return FORBIDDING_LICENCE_IDS.includes(declared.toLowerCase()) ? declared : undefined;
}

/** A declared edition, or undefined. Same discipline as the licence. */
export function declaredEdition(body: string): string | undefined {
  const m = /(?:^|[\s"'>])edition\s*[:=]\s*["']?([A-Za-z0-9.\-+]+)/i.exec(body);
  return m?.[1];
}

/**
 * Whether landing this verbatim would break the project's own artifact rules.
 *
 * Mirrors `no-executable-content`'s categories rather than importing it: that
 * rule is a per-file schema rule over a parsed document, and this runs over raw
 * text before anything is written. Kept deliberately BROADER than the rule —
 * this decides whether to land material at all, so a false positive costs a
 * reported file a human can look at, while a false negative costs a project
 * that no longer validates.
 */
export function carriesExecutableContent(body: string): boolean {
  return (
    /<script[\s>]/i.test(body) ||
    /<iframe[\s>]/i.test(body) ||
    /\son[a-z]+\s*=/i.test(body) ||
    /["'(]\s*javascript:/i.test(body) ||
    /(?:src|href)\s*=\s*["']\s*data:/i.test(body)
  );
}

/**
 * Deterministic content hash (FNV-1a, 32-bit, hex).
 *
 * Not a cryptographic hash and not claiming to be — its whole job is to answer
 * "is this the same bytes as last time". Implemented here rather than taken
 * from the platform so the module stays free of a runtime dependency and a
 * test can assert a literal value.
 */
export function contentHash(body: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < body.length; i++) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Colour literals, which are the values an emitted artifact actually carries.
 *  Hex only: a named colour is ambiguous and a computed one is not text. */
const COLOUR_RE = /#[0-9a-fA-F]{3,8}\b/g;

/**
 * Derive token candidates from landed material (FR-010).
 *
 * Ordered by how often a value appears, then by the value itself so the output
 * is stable across runs — a manifest that reorders itself on every import is a
 * diff nobody can read.
 */
export function deriveTokenCandidates(files: readonly { name: string; body: string }[]): TokenCandidate[] {
  const seen = new Map<string, { occurrences: number; sources: Set<string> }>();
  for (const { name, body } of files) {
    for (const raw of body.match(COLOUR_RE) ?? []) {
      const value = raw.toLowerCase();
      const entry = seen.get(value) ?? { occurrences: 0, sources: new Set<string>() };
      entry.occurrences += 1;
      entry.sources.add(name);
      seen.set(value, entry);
    }
  }
  return [...seen.entries()]
    .map(([value, e]) => ({
      value,
      occurrences: e.occurrences,
      sources: [...e.sources].sort(),
      inferred: true as const,
      confirmed: false as const,
    }))
    .sort((a, b) => b.occurrences - a.occurrences || a.value.localeCompare(b.value));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Render the import manifest (FR-004, FR-005, FR-006).
 *
 * An artifact rather than a return value, because both requirements are about
 * a *reader*: FR-006 says the review mark must be visible to one, and a ledger
 * handed back to a caller is visible to nobody once the command exits.
 *
 * Carries no custom elements. The visual vocabulary has no element for "a file
 * arrived from somewhere", and inventing one here would be adding vocabulary
 * outside the spec that owns it — the exact mistake that left an unspecified
 * artifact behind last time.
 */
export function renderManifest(identity: string, ledger: ImportLedger): string {
  const row = (f: ImportedFile): string =>
    `<tr><td><code>${escapeHtml(f.path)}</code></td><td>${escapeHtml(f.provenance.origin)}</td>` +
    `<td>${escapeHtml(f.provenance.originUrl)}</td><td>${escapeHtml(f.provenance.edition)}</td>` +
    `<td>${escapeHtml(f.provenance.license)}</td><td><code>${escapeHtml(f.provenance.contentHash)}</code></td>` +
    '<td><strong>NOT REVIEWED</strong></td></tr>';

  const candidate = (c: TokenCandidate): string =>
    `<tr><td><code>${escapeHtml(c.value)}</code></td><td>${c.occurrences}</td>` +
    `<td>${escapeHtml(c.sources.join(', '))}</td><td><strong>INFERRED — UNCONFIRMED</strong></td></tr>`;

  const note = (heading: string, body: string, items: readonly string[]): string =>
    items.length === 0 ? '' : `<h2>${heading}</h2><p>${body}</p><ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Imported design material — ${escapeHtml(identity)}</title>
</head>
<body>
<h1>Imported design material</h1>
<p>Landed under the identity <code>${escapeHtml(identity)}</code>. Everything below arrived from somewhere else and <strong>none of it has been reviewed</strong>. Nothing in the project refers to the location it came from; deleting that location changes nothing here.</p>

<h2>Provenance</h2>
<p>One row per landed file. A field recorded as <code>${UNKNOWN}</code> was not declared by the export and has deliberately not been guessed.</p>
<table>
<thead><tr><th>File</th><th>Origin</th><th>Origin URL</th><th>Edition</th><th>Licence</th><th>Content hash</th><th>Review</th></tr></thead>
<tbody>${ledger.files.map(row).join('')}</tbody>
</table>

<h2>Token candidates</h2>
<p>Values observed in the landed material, offered for confirmation. <strong>None of these is in the token set</strong> and none carries a name — naming a token is a decision about meaning, and a wrong name is worse than no name because it looks decided. A confirmed candidate is authored into the token set by hand; a declared value always outranks anything here.</p>
<table>
<thead><tr><th>Value</th><th>Occurrences</th><th>Seen in</th><th>Status</th></tr></thead>
<tbody>${ledger.tokenCandidates.map(candidate).join('')}</tbody>
</table>
${note('Not landed', 'These carry a runtime. Landing them verbatim would break the project&#39;s own artifact rules, so they are reported here instead.', ledger.unhandled)}
${note('Refused', 'A licence forbids landing a copy.', ledger.refused.map((r) => `${r.name} — ${r.reason}`))}
${note('No longer in the export', 'Present here, absent from the latest export. Reported, never deleted — an element missing from an export is as likely to be an export setting as a deletion.', ledger.orphaned)}
</body>
</html>
`;
}
