/**
 * Importing a design export (spec 105-design-source-import).
 *
 * A SINGLE EXECUTE PASS, not plan-then-execute. That distinction is
 * deliberate: the corpus importer writes as it goes and keys re-import on a
 * stable anchor, while plan-then-execute belongs to contract promotion, whose
 * problem is a destination somebody else may have moved. Conflating the two
 * would add a planning phase that protects against nothing here.
 *
 * FR-014 and FR-015 were added after a real handoff was run (applied change
 * 2026-08-13-read-more-land-less): material that cannot be landed safely is
 * reported rather than dropped, and reading a file is a different permission
 * from copying one. FR-004 was widened in the same change — provenance is owed
 * for every file READ, since the file contributing most of the derived colour
 * is precisely the one that is never copied.
 *
 * Four properties are transferred from the corpus importer rather than invented:
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

import { CHANGE_CLASSES, type ChangeClass } from '@spectastic/schema/visual-vocabulary';

import type { FileSystem } from '../types.js';
import type { DesignSourceFetcher } from './source-fetcher.js';
import { assertTokenSetVersion } from './token-set-guard.js';

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
/** Fields every candidate carries, confirmed or not. */
interface TokenCandidateBase {
  value: string;
  /** How many times it appears across the landed material. A value used once
   *  is far more likely to be incidental than one used thirty times. */
  occurrences: number;
  /** The export files it was seen in — which may include one that was not
   *  landed, so a reviewer following this up should expect to look at the
   *  export rather than only at the project. */
  sources: string[];
  /** True when some or all of the evidence came from material that was READ
   *  but never LANDED (FR-015). Marked because FR-003 encourages deleting the
   *  export once an import is done, so a source named here may not be in the
   *  project and may not be anywhere — and "go and look" must never be silent
   *  advice about a file that is gone. Raised by this spec's own risk pass. */
  fromUnlanded: boolean;
  /** FR-005 — derived, never declared, and never outranking a declared value
   *  while unconfirmed. Fixed `true` in BOTH branches of the union below: the
   *  last clause of FR-005 requires the record that a value was derived to
   *  remain even after confirmation, so this flag never reverts to false — the
   *  branch on `confirmed` is what actually changes what the candidate may do. */
  inferred: true;
}

/** Presented for confirmation. Nothing here is in the token set yet. */
export interface UnconfirmedTokenCandidate extends TokenCandidateBase {
  confirmed: false;
}

/**
 * A confirmed candidate, per FR-016: the write it authorises MUST carry a name
 * and a change class the confirmer supplies, and the tool MUST NOT supply
 * either — so both are required fields here rather than optional ones a caller
 * could omit.
 */
export interface ConfirmedTokenCandidate extends TokenCandidateBase {
  confirmed: true;
  /** Supplied by the confirmer. Never invented — see the docstring above on
   *  why a candidate is deliberately unnamed until this point. */
  name: string;
  /** Also the confirmer's, not the tool's (own-the-write correction, 098 FR-005):
   *  a release's change class is the producer's claim, and a tool that picked
   *  one would be asserting something its producer never said. */
  changeClass: string;
}

/**
 * A value read out of an emitted artifact rather than out of design data.
 *
 * Deliberately UNNAMED while unconfirmed. Naming it `color.surface` would be
 * the tool inventing the one thing the human is uniquely able to supply — a
 * token name is a decision about meaning, and a wrong one is worse than none
 * because it looks decided. So a candidate carries what was observed and
 * where, and the naming happens at confirmation — which is also the moment
 * `TokenCandidate` stops being only the unconfirmed shape.
 *
 * Recorded ceiling: a stronger signal exists and is not used yet. A literal
 * appearing at the same structural position in a light subtree and a dark one
 * is a MODE PAIR rather than two unrelated colours, which is exactly what a
 * real export looks like — see triage T-009, where forty-odd literals were
 * hand-duplicated across two otherwise-identical copies. Pairing them needs
 * structural comparison rather than counting, so it is named here rather than
 * half-done.
 */
export type TokenCandidate = UnconfirmedTokenCandidate | ConfirmedTokenCandidate;

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

/**
 * Every file under `dir`, at its path relative to `dir`, depth-first and in a
 * stable order (triage T-016).
 *
 * Dot-entries are skipped at every level, not just the root — a design tool's
 * `.thumbnail` is not design material, and neither is anything inside a dot
 * directory it might ship.
 *
 * Returns paths, never contents: the caller decides what to read, which keeps
 * the read/land permission split (FR-015) in one place.
 */
export async function collectExportFiles(fs: FileSystem, dir: string, prefix = ''): Promise<string[]> {
  const out: string[] = [];
  for (const name of (await fs.readdir(dir)).filter((f) => !f.startsWith('.')).sort()) {
    const rel = prefix === '' ? name : `${prefix}/${name}`;
    const stat = await fs.stat(`${dir}/${name}`);
    if (stat.isDirectory) out.push(...(await collectExportFiles(fs, `${dir}/${name}`, rel)));
    else out.push(rel);
  }
  return out;
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

  // The destination sidecar may not exist yet — a project's FIRST import is the
  // ordinary case (US1), not an edge one. Without this every first run ends in
  // ENOENT on the first write, which is triage T-015: the same defect the apply
  // kernel had at its own first archive (meta-spec T-007), and the reason
  // `FileSystem.mkdir` is on the port at all. The corpus importer this spec
  // transfers its four properties from has always done this; only the import
  // did not adopt it.
  //
  // Before the write loop rather than lazily per file, so a refusal that lands
  // nothing still leaves the directory it would have used — and idempotent, so
  // a re-import over an existing sidecar is unaffected.
  await fs.mkdir(input.into);

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

  // Every file in the export, at its path RELATIVE to the export root, walked
  // depth-first (triage T-016).
  //
  // This used to be a flat `readdir`, and every entry was handed straight to
  // `readFile` — so the first subdirectory in a real export threw EISDIR and
  // the import died before writing its manifest. Every fixture in this suite
  // was flat, and the previous in-memory stub could not represent a directory
  // at all, so nothing could catch it. A real Claude Design export has
  // `uploads/` beside its files, which is how it surfaced.
  //
  // Relative paths are preserved rather than flattened: 094 FR-008 permits a
  // project to subdivide a sidecar, and flattening would collide two files that
  // differ only by directory while silently changing what the export said.
  const entries = await collectExportFiles(fs, dir);

  // Read, not landed. Deriving tokens is a different permission from copying:
  // a file may be unsafe to LAND and still be perfectly readable, and in a real
  // export the file carrying the runtime is also the one carrying most of the
  // colour. Refusing to land it and then ignoring it would throw away the best
  // input FR-010 has. A LICENCE refusal is excluded, because that one really is
  // a permission to use the material at all.
  const readable: { name: string; body: string; landed: boolean }[] = [];

  // FR-004 (widened by 2026-08-13-read-more-land-less) — provenance is owed for
  // every file the import READS, not only for the ones it lands. The file
  // contributing most of the derived colour is precisely the one that is read
  // and never copied, so the narrower scope left the material with the most
  // influence over the output as the material with no record at all.
  const provenanceOf = (body: string): Provenance => ({
    origin: input.origin ?? UNKNOWN,
    originUrl: input.originUrl ?? UNKNOWN,
    edition: declaredEdition(body) ?? UNKNOWN,
    license: declaredLicence(body) ?? UNKNOWN,
    contentHash: contentHash(body),
  });

  // TWO PHASES, and the split is NFR-001 (triage T-017): read and decide
  // everything first, write only once nothing can still fail. The pass used to
  // interleave them, so a read that threw partway left earlier files on disk
  // with no manifest beside them — material claiming nothing about its own
  // provenance or review state, which is the state NFR-001 forbids. The real
  // run that found this left a 68 KB runtime exactly that way.
  //
  // Recorded ceiling, because "atomic" would overclaim: a failure during the
  // WRITE phase below can still leave a partial sidecar. Closing that needs a
  // staging directory and a rename, which the port supports and which is not
  // taken on here — the failure this fixes is the one that actually happens,
  // since reading somebody else's export is where the surprises live.
  const planned: { name: string; destination: string; body: string; kind: 'written' | 'replaced' }[] = [];

  for (const name of entries) {
    const source = `${dir}/${name}`;
    const destination = `${input.into}/${name}`;
    const body = await fs.readFile(source);

    // FR-012 — a licence that forbids landing stops the file, and says which
    // and why. Decided before any write, so a refusal leaves no partial
    // material behind.
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
    if (landingWouldViolate(name, body)) {
      ledger.unhandled.push(name);
      readable.push({ name, body, landed: false });
      // Read, so its provenance is owed too. Recorded against the SOURCE name
      // rather than a destination, because there is no destination — which is
      // itself the fact a reader needs.
      ledger.files.push({ path: name, provenance: provenanceOf(body), inferred: false, reviewed: false });
      continue;
    }

    readable.push({ name, body, landed: true });

    // FR-006 — everything lands not-yet-reviewed. Not a default a caller can
    // pass around: the type fixes it at `false`.
    ledger.files.push({ path: destination, provenance: provenanceOf(body), inferred: false, reviewed: false });

    let existing: string | undefined;
    try {
      existing = await fs.readFile(destination);
    } catch {
      existing = undefined;
    }

    if (existing === body) {
      ledger.skipped.push(name);
      continue;
    }
    planned.push({ name, destination, body, kind: existing === undefined ? 'written' : 'replaced' });
  }

  // --- write phase: nothing above this line has touched the destination ---
  for (const w of planned) {
    // A nested export path needs its parent inside the sidecar (T-016). Cheap
    // and idempotent, so it runs per file rather than being tracked — the cost
    // is a syscall on a directory that already exists, and the alternative is
    // a set that has to stay correct.
    const parent = w.destination.slice(0, w.destination.lastIndexOf('/'));
    if (parent !== '' && parent !== input.into) await fs.mkdir(parent);
    await fs.writeFile(w.destination, w.body);
    ledger[w.kind].push(w.name);
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
 * FR-014 owns this. It shipped before the requirement did, which is the wrong
 * order and the reason the requirement now exists: the behaviour generalises
 * FR-011's reporting posture from an annotation category the vocabulary cannot
 * place to a whole file the project cannot hold, and a generalisation made
 * quietly in code leaves a later reader a distinction with no argument behind
 * it and no reason not to simplify it away.
 *
 * Mirrors `no-executable-content`'s categories rather than importing it: that
 * rule is a per-file schema rule over a parsed document, and this runs over raw
 * text before anything is written. Kept deliberately BROADER than the rule —
 * this decides whether to land material at all, so a false positive costs a
 * reported file a human can look at, while a false negative costs a project
 * that no longer validates.
 */
/**
 * Extensions the project validates as artifacts. Only these can violate the
 * artifact rules, so only these are worth checking.
 */
const HTML_SUFFIXES = ['.html', '.htm', '.xhtml', '.svg'];

/**
 * Whether landing this file would risk the project's own artifact rules.
 *
 * The extension check is not an optimisation. Found by running a real import
 * over a zip: a `README.md` explaining that the export "carries a `<script>`"
 * was refused, because prose ABOUT executable content matches every pattern
 * executable content does. Markdown and stylesheets are never parsed as
 * artifacts, so they cannot trip the rule this guards — and refusing them costs
 * a reader the one file most likely to explain the export.
 *
 * SVG is included deliberately: it is the one image format that really can
 * carry a script, and it is a plausible thing for a design tool to emit.
 *
 * WHAT THIS LIST DOES NOT DO, stated because it was an accident until it was a
 * decision (triage T-018, and now FR-014's second sentence). A file that IS a
 * script — a bare `.js` — is not inspected and lands. That is deliberate: this
 * check protects FR-003, the project staying valid after an import, and a loose
 * script breaks no artifact rule. No rule parses it, and the security scan's
 * globs do not reach it. Refusing it would mean deciding what BELONGS in a
 * project rather than what is SAFE to copy — a judgement with no crisp test.
 *
 * So a real import lands a design tool's runtime, and that is the intended
 * outcome rather than an oversight. What the import asserts about it is its
 * provenance and that nobody has reviewed it; a project that does not want the
 * file removes it, which is a project's decision and not a copier's.
 */
export function landingWouldViolate(name: string, body: string): boolean {
  const lower = name.toLowerCase();
  if (!HTML_SUFFIXES.some((suffix) => lower.endsWith(suffix))) return false;
  return carriesExecutableContent(body);
}

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
export function deriveTokenCandidates(
  files: readonly { name: string; body: string; landed: boolean }[],
): UnconfirmedTokenCandidate[] {
  const seen = new Map<string, { occurrences: number; sources: Set<string>; fromUnlanded: boolean }>();
  for (const { name, body, landed } of files) {
    for (const raw of body.match(COLOUR_RE) ?? []) {
      const value = raw.toLowerCase();
      const entry = seen.get(value) ?? { occurrences: 0, sources: new Set<string>(), fromUnlanded: false };
      entry.occurrences += 1;
      entry.sources.add(name);
      if (!landed) entry.fromUnlanded = true;
      seen.set(value, entry);
    }
  }
  return [...seen.entries()]
    .map(([value, e]) => ({
      value,
      occurrences: e.occurrences,
      sources: [...e.sources].sort(),
      fromUnlanded: e.fromUnlanded,
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
    `<td>${escapeHtml(c.sources.join(', '))}${c.fromUnlanded ? ' <strong>(not landed — see the export)</strong>' : ''}</td>` +
    '<td><strong>INFERRED — UNCONFIRMED</strong></td></tr>';

  const note = (heading: string, body: string, items: readonly string[]): string =>
    items.length === 0
      ? ''
      : `<h2>${heading}</h2><p>${body}</p><ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;

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
<p>Values observed in the material this import read, offered for confirmation. A source marked <strong>not landed</strong> was read but deliberately not copied into the project — so it is in the export and not here, and the export may since have been deleted. <strong>None of these is in the token set</strong> and none carries a name — naming a token is a decision about meaning, and a wrong name is worse than no name because it looks decided. Confirming a candidate writes it into the token set under a name and a change class the confirmer supplies — never the tool — and moves the set's version under its own bump policy; a candidate that has not been confirmed never outranks a declared value.</p>
<table>
<thead><tr><th>Value</th><th>Occurrences</th><th>Seen in</th><th>Status</th></tr></thead>
<tbody>${ledger.tokenCandidates.map(candidate).join('')}</tbody>
</table>
${note('Not landed', 'These carry a runtime. Landing them verbatim would break the project&#39;s own artifact rules, so they are reported here instead.', ledger.unhandled)}
${note(
  'Refused',
  'A licence forbids landing a copy.',
  ledger.refused.map((r) => `${r.name} — ${r.reason}`),
)}
${note('No longer in the export', 'Present here, absent from the latest export. Reported, never deleted — an element missing from an export is as likely to be an export setting as a deletion.', ledger.orphaned)}
</body>
</html>
`;
}

// --- confirming a candidate, per FR-016 (applied change 2026-08-14-own-the-write) ---
//
// 098 ships a reader and a compare-and-swap guard, never a writer — and its
// own out-of-scope defers "importing a token set from a design tool, and what
// its version means on arrival" here in writing. So this spec owns the write,
// reusing 098's guard rather than reimplementing it, and stating the
// properties the write must satisfy (version moves under the bump policy,
// a stale set is refused, the record survives) rather than naming a mechanism
// that does not exist. `name`, `changeClass` and `toVersion` are all input
// parameters the caller supplies from the confirmer — the tool invents none.
//
// THE PRODUCED VERSION IS AN INPUT, NOT A COMPUTATION (triage T-014).
//
// The first implementation derived it: `bumpVersion(from, tier)`, standard
// semver arithmetic. That was drift, and the requirement was clear enough to
// have caught it — FR-016 says the version moves "under the versioning
// policy", and 098 FR-001 deliberately keeps that policy as the token set
// element's OWN PROSE, precisely so a human reads it at the moment of
// bumping. Prose cannot be discharged mechanically, so arithmetic was a
// different policy wearing the same name, and a project whose stated policy
// diverges would have got a number its producer never declared.
//
// Refusing to author one is the conservative half of the open question in
// triage T-013 (who supplies the produced version). It is also reversible: if
// that card later decides a policy can be read mechanically, deriving becomes
// additive, whereas an invented version already written into a token set is
// not recoverable from.

/** Locates the `<spec-token-set …>` opening tag, whose `version=` attribute a
 *  bump must update and inside which a new `<spec-release>` lands. */
const TOKEN_SET_OPEN_TAG = /<spec-token-set\b[^>]*>/i;

/**
 * Bump the live `visual/tokens.html` text: move `version=` to `to`, and
 * record the transition as a `<spec-release>` (098's own element, read by
 * `readTokenSet` and checked by `token-set-shape` — nothing new is invented).
 *
 * `binds-from=` is left untouched. It anchors which version work already
 * accepted stays conformant to (098 FR-002), and nothing about confirming one
 * token argues for moving that anchor — least of all silently, inside a write
 * whose job is a single value.
 */
export function applyTokenSetRelease(
  liveHtml: string,
  from: string,
  to: string,
  tier: ChangeClass,
  name: string,
): string {
  const match = TOKEN_SET_OPEN_TAG.exec(liveHtml);
  if (match === null) {
    throw new Error('token-set write: no <spec-token-set> element found to bump.');
  }
  const openTag = match[0];
  const boundOpenTag = openTag.replace(/\bversion=(["'])[^"']*\1/i, `version="${to}"`);
  const release =
    `\n  <spec-release from="${from}" to="${to}" class="${tier}">\n` +
    `    <p>Confirmed <code>${escapeHtml(name)}</code> from an import.</p>\n` +
    '  </spec-release>';
  const start = match.index;
  return liveHtml.slice(0, start) + boundOpenTag + release + liveHtml.slice(start + openTag.length);
}

/** A hex colour as DTCG's structured colour `$value` (the shape this
 *  project's own token files already use — see `visual/tokens/base.tokens.json`
 *  in the currency-converter example). */
function dtcgColorValue(hex: string): {
  colorSpace: 'srgb';
  components: [number, number, number];
  alpha: number;
  hex: string;
} {
  const digits = hex.replace('#', '');
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((c) => c + c)
          .join('')
      : digits.slice(0, 6);
  const channel = (offset: number): number =>
    Math.round((Number.parseInt(full.slice(offset, offset + 2), 16) / 255) * 10000) / 10000;
  return { colorSpace: 'srgb', components: [channel(0), channel(2), channel(4)], alpha: 1, hex: `#${full}` };
}

/**
 * Set a DTCG token at a dotted path (`color.accent` → `{color:{accent:{…}}}`),
 * creating intermediate groups as needed. Mutates and returns `root`.
 *
 * `$extensions` carries the fact FR-016 requires survive confirmation: this
 * value arrived derived, and is now confirmed rather than authored. DTCG's
 * own extension mechanism is reused rather than a bespoke field, so another
 * tool reading this file is not confused by vocabulary only this one knows.
 */
function setTokenAtPath(root: Record<string, unknown>, dottedName: string, hex: string): Record<string, unknown> {
  const parts = dottedName.split('.');
  let node = root;
  for (const key of parts.slice(0, -1)) {
    const next = node[key];
    if (typeof next !== 'object' || next === null) node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  const leaf = parts.at(-1) as string;
  node[leaf] = {
    $type: 'color',
    $value: dtcgColorValue(hex),
    $extensions: { 'dev.spectastic.import': { derived: true, confirmed: true } },
  };
  return root;
}

export interface ConfirmWriteInput {
  /** Where the versioned wrapper lives — 098's `<spec-token-set>` artifact. */
  tokenSetPath: string;
  /** Where the DTCG token file this candidate's value is written into lives. */
  tokensJsonPath: string;
  /** The dotted token name. Supplied by the confirmer; the tool never invents
   *  one (see `TokenCandidate`'s docstring on why a candidate ships unnamed). */
  name: string;
  /** Also the confirmer's claim, never the tool's (098 FR-005). */
  changeClass: ChangeClass;
  /** The version this confirmation was prepared against. Compare-and-swap
   *  against the live value at write time (FR-016's "refuse a set that has
   *  changed since it was read") — reusing 098's guard rather than a second
   *  one, so there is exactly one place that decides what "stale" means. */
  declaredFrom: string;
  /** The version this release produces. ALSO the confirmer's (triage T-014):
   *  the governing bump policy is prose by design, so the tool cannot derive
   *  this without substituting a policy of its own. */
  toVersion: string;
  candidate: UnconfirmedTokenCandidate;
}

/**
 * Confirming a derived candidate writes it into the project's token set
 * (FR-016). Moves the version to the one the confirmer declared, refuses a
 * stale set via 098's own guard, and records on the written token that it
 * arrived derived and is now confirmed rather than authored.
 */
export async function writeConfirmedToken(input: ConfirmWriteInput, fs: FileSystem): Promise<ConfirmedTokenCandidate> {
  let liveHtml: string;
  try {
    liveHtml = await fs.readFile(input.tokenSetPath);
  } catch {
    throw new Error(`token-set write: no token set found at "${input.tokenSetPath}" to confirm into.`);
  }

  // Fails closed on a stale or unreadable live version (098 NFR-002) — the one
  // guard, reused rather than reimplemented.
  assertTokenSetVersion(liveHtml, input.declaredFrom);

  const updatedHtml = applyTokenSetRelease(
    liveHtml,
    input.declaredFrom,
    input.toVersion,
    input.changeClass,
    input.name,
  );
  await fs.writeFile(input.tokenSetPath, updatedHtml);

  let tokens: Record<string, unknown>;
  try {
    tokens = JSON.parse(await fs.readFile(input.tokensJsonPath)) as Record<string, unknown>;
  } catch {
    tokens = {};
  }
  setTokenAtPath(tokens, input.name, input.candidate.value);
  await fs.writeFile(input.tokensJsonPath, `${JSON.stringify(tokens, null, 2)}\n`);

  return {
    ...input.candidate,
    confirmed: true,
    name: input.name,
    changeClass: input.changeClass,
  };
}

export class TokenConfirmationError extends Error {}

/** Same shape as {@link ConfirmWriteInput}, except the three confirmer-supplied
 *  fields arrive UNVALIDATED — raw input, which is exactly what this function's
 *  job is to check before anything is written. */
export interface ConfirmCandidateInput {
  tokenSetPath: string;
  tokensJsonPath: string;
  declaredFrom: string;
  /** Supplied by the confirmer, or omitted. Never filled in by the tool. */
  name: string | undefined;
  /** Also the confirmer's. Validated against the closed set of three bump
   *  tiers and nothing else — the tier itself is never verified (098 FR-005). */
  changeClass: string | undefined;
  /** Also the confirmer's (triage T-014). Validated only for PRESENCE and
   *  readable shape — never computed, and never checked for agreement with the
   *  declared tier, because the policy deciding what a tier produces is prose
   *  this code does not read. Checking would be the same substitution one step
   *  removed. */
  toVersion: string | undefined;
  candidate: UnconfirmedTokenCandidate;
}

/** A version the guard and the release attribute can both carry. Deliberately
 *  a SHAPE check and not a policy check — see `toVersion` above. */
const READABLE_VERSION = /^\d+\.\d+\.\d+$/;

/**
 * Take a name, a change class and the produced version from the confirmer,
 * refuse a candidate missing any of the three, and suggest none (FR-016).
 *
 * The refusal is deliberately blunt — no fallback, no default class, no name
 * derived from the value, no version derived from the tier. FR-010's own
 * docstring on `TokenCandidate` already argues why for the name: naming a
 * token is a decision about meaning, and a wrong guess is worse than none
 * because it looks decided. The same argument carries to the class, which 098
 * FR-005 requires be presented as the producer's claim, and to the version,
 * whose governing policy 098 FR-001 keeps as prose precisely so a human reads
 * it at the moment of bumping (triage T-014).
 */
export async function confirmTokenCandidate(
  input: ConfirmCandidateInput,
  fs: FileSystem,
): Promise<ConfirmedTokenCandidate> {
  const name = input.name?.trim();
  if (name === undefined || name === '') {
    throw new TokenConfirmationError(
      'token confirmation: no name supplied. Naming a token is a decision only the confirmer can make — nothing here suggests one.',
    );
  }

  const changeClass = input.changeClass?.trim();
  if (changeClass === undefined || changeClass === '' || !CHANGE_CLASSES.includes(changeClass as ChangeClass)) {
    throw new TokenConfirmationError(
      `token confirmation: no valid change class supplied (must be one of ${CHANGE_CLASSES.join(', ')}). ` +
        "The tier is the confirmer's claim, never the tool's — nothing here picks one.",
    );
  }

  const toVersion = input.toVersion?.trim();
  if (toVersion === undefined || toVersion === '' || !READABLE_VERSION.test(toVersion)) {
    throw new TokenConfirmationError(
      'token confirmation: no produced version supplied. The bump policy governing it lives as prose in the token set, ' +
        'so it cannot be derived here — read the policy and state the version this release produces.',
    );
  }

  return writeConfirmedToken(
    {
      tokenSetPath: input.tokenSetPath,
      tokensJsonPath: input.tokensJsonPath,
      declaredFrom: input.declaredFrom,
      name,
      changeClass: changeClass as ChangeClass,
      toVersion,
      candidate: input.candidate,
    },
    fs,
  );
}
