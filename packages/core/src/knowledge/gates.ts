/**
 * The corpus grounding gates (053-corpus-grounding-gates, plan D-001/D-002).
 *
 * One traversal of every `<spec-decision>` citation in a set of docs,
 * resolved against the loaded corpus via 052's `resolveCitation`. Its return
 * picks the finding:
 *
 *  - `null` (no committed text at that id/edition — including a fabricated
 *    or typo'd pinned edition) → `corpus-provenance`, **error** (FR-001):
 *    deterministic, fail-closed, the same footing as `verify-view-stale`.
 *  - `{kind:'superseded'}` (a retained prior edition) → `corpus-staleness`,
 *    **warning** (FR-002): loud like an `assumed` decision, but never blocks
 *    a build — the world may have moved with no one having re-ingested.
 *  - `{kind:'current'}` → clean.
 *
 * A no-op when the corpus is empty or a doc has no citation (FR-003). Reads
 * no profile marker at all — the integrity gates are tier-independent by
 * construction (FR-004's MUST clause); the laddered advisory nudge FR-004
 * also names is undecidable and deliberately not built here (plan D-004).
 * Deterministic (NFR-001): no clock reads, only the corpus's own recorded
 * editions.
 *
 * Registry-first resolution (2026-07-26-hybrid-corpus-citation, T-1001, FR-002
 * MODIFY): an optional `registry` parameter is threaded straight through to
 * 052's own `resolveCitation`, so a citation resolves against the root
 * `knowledge/index.md` registry on the enforcement path too — not only in
 * the resolver's own unit tests. Absent/empty registry falls back to the
 * pack scan unchanged, so no shipped citation's finding changes on this
 * apply (the same back-compat window T-1000 established).
 */
import { findAll, getLocation, parse } from '@spectastic/schema/parser';
import type { Element } from '@spectastic/schema/parser';
import { findCitationTokens, parseCorpusCitation } from '@spectastic/schema/citation';
import type { Finding } from '@spectastic/schema';
import { resolveCitation } from './resolve.js';
import type { CorpusPack, RegistryEntry } from './types.js';

/** Collect an element's visible text, collapsed (mirrors slo-well-formed's
 * / corpus-citation-form's textOf). */
function textOf(el: Element): string {
  let out = '';
  const visit = (node: unknown): void => {
    const n = node as { tagName?: string; value?: string; childNodes?: unknown[] };
    if (n.tagName === undefined && typeof n.value === 'string') out += n.value;
    if (n.childNodes) for (const child of n.childNodes) visit(child);
  };
  visit(el);
  return out.replace(/\s+/g, ' ').trim();
}

function provenanceFinding(file: string, decision: Element, token: string): Finding {
  const loc = getLocation(decision);
  return {
    file,
    line: loc.line,
    column: loc.column,
    rule: 'corpus-provenance',
    severity: 'error',
    message: `Corpus citation "${token}" resolves to no committed document at that id/edition — a dead reference.`,
    fixHint: 'Fix the id or edition, or ingest the document the citation names.',
  };
}

function stalenessFinding(file: string, decision: Element, token: string, currentEdition: string): Finding {
  const loc = getLocation(decision);
  return {
    file,
    line: loc.line,
    column: loc.column,
    rule: 'corpus-staleness',
    severity: 'warning',
    message: `Corpus citation "${token}" is pinned to a superseded edition — the current edition is ${currentEdition}.`,
    fixHint: 'Re-ground against the current edition, or accept the pin deliberately if the historical claim is intentional.',
  };
}

/** Every corpus-grounding finding for one decision's citations. */
function decisionFindings(
  file: string,
  decision: Element,
  packs: readonly CorpusPack[],
  registry: readonly RegistryEntry[] | undefined,
): Finding[] {
  const findings: Finding[] = [];
  for (const token of findCitationTokens(textOf(decision))) {
    const citation = parseCorpusCitation(token);
    if (citation === null) continue; // malformed shape — corpus-citation-form's concern, not this gate's
    const resolved = resolveCitation(packs, citation, registry);
    if (resolved === null) {
      findings.push(provenanceFinding(file, decision, token));
    } else if (resolved.kind === 'superseded') {
      findings.push(stalenessFinding(file, decision, token, findCurrentEdition(packs, citation.id)));
    }
  }
  return findings;
}

/** The current edition of a KB id across every pack, for the staleness
 * message ("the current edition is X"). Empty string if genuinely unknown
 * (can't happen when a superseded match was found, but kept total). */
function findCurrentEdition(packs: readonly CorpusPack[], id: string): string {
  for (const pack of packs) {
    const doc = pack.documents.find((d) => d.id === id);
    if (doc) return doc.provenance.edition ?? '';
  }
  return '';
}

export function corpusGroundingFindings(
  docs: readonly { html: string; file: string }[],
  packs: readonly CorpusPack[],
  registry?: readonly RegistryEntry[],
): Finding[] {
  if (packs.length === 0) return [];
  const findings: Finding[] = [];
  for (const { html, file } of docs) {
    const doc = parse(html, file);
    for (const decision of findAll(doc.ast, 'spec-decision')) {
      findings.push(...decisionFindings(file, decision, packs, registry));
    }
  }
  return findings;
}
