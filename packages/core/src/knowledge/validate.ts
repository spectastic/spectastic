/**
 * corpus-well-formed — the folded validate scan for the knowledge corpus
 * (051-knowledge-corpus, T-110, plan D-003 corrected). A CLI `scanX()`
 * wrapper (T-112) calls `loadCorpus()` then this pure function, exactly as
 * `scanEnforceWaivers`/`scanCopyLeak` already do for their own non-HTML
 * checks in `packages/cli/src/commands/validate.ts` — never a
 * `packages/schema/src/rules/*` entry, since that registry is HTML-bound
 * (every rule takes a `ParsedDocument`) and the corpus is plain markdown.
 *
 * Three checks per pack, all at error severity — a written citation or
 * index row either resolves or it doesn't, fully deterministic:
 *  - every document declares its required fields (`id` plus
 *    `REQUIRED_PROVENANCE_FIELDS`) — FR-002/FR-003
 *  - the index and the documents agree bidirectionally: every index row
 *    resolves to a document with a matching id, and every document appears
 *    in the index — FR-004, SC-001
 *  - no two documents in a pack share one `KB-NNN` id — FR-002, P-3
 */
import type { Finding } from '@spectastic/schema';
import type { CorpusDocument, CorpusPack } from './types.js';

const RULE = 'corpus-well-formed';

function errorFinding(file: string, message: string): Finding {
  return { file, line: 1, column: 1, rule: RULE, severity: 'error', message };
}

/** Every document with a non-empty `missingFields` (parse.ts already
 * computed the gap; this just turns it into a finding). */
function missingFieldFindings(pack: CorpusPack): Finding[] {
  return pack.documents
    .filter((doc) => doc.missingFields.length > 0)
    .map((doc) =>
      errorFinding(
        doc.filePath,
        `${doc.filePath} is missing required field(s): ${doc.missingFields.join(', ')}.`,
      ),
    );
}

/** Every index row whose id has no matching document in the pack. */
function danglingIndexFindings(pack: CorpusPack): Finding[] {
  const documentIds = new Set(
    pack.documents.map((d) => d.id).filter((id): id is string => id !== null),
  );
  return pack.index
    .filter((row) => !documentIds.has(row.id))
    .map((row) =>
      errorFinding(
        `${pack.dirPath}/index.md`,
        `Index row ${row.id} (${row.path}) has no matching document in ${pack.name}'s references/.`,
      ),
    );
}

/** Every document with an id that has no matching row in the pack's index. */
function orphanDocumentFindings(pack: CorpusPack): Finding[] {
  const indexIds = new Set(pack.index.map((e) => e.id));
  return pack.documents
    .filter((doc): doc is CorpusDocument & { id: string } => doc.id !== null && !indexIds.has(doc.id))
    .map((doc) =>
      errorFinding(
        doc.filePath,
        `${doc.filePath} (${doc.id}) has no matching row in ${pack.name}'s curated index.`,
      ),
    );
}

/** Group documents by id, then flag every group with more than one entry —
 * KB-NNN ids must be unique within a pack (P-3: IDs are contracts). */
function duplicateIdFindings(pack: CorpusPack): Finding[] {
  const byId = new Map<string, CorpusDocument[]>();
  for (const doc of pack.documents) {
    if (!doc.id) continue;
    const group = byId.get(doc.id) ?? [];
    group.push(doc);
    byId.set(doc.id, group);
  }
  const findings: Finding[] = [];
  for (const [id, docs] of byId) {
    if (docs.length < 2) continue;
    const firstPath = docs[0]?.filePath ?? pack.dirPath;
    const paths = docs.map((d) => d.filePath).join(', ');
    findings.push(errorFinding(firstPath, `Duplicate KB id ${id} in ${paths} — KB-NNN ids must be unique.`));
  }
  return findings;
}

/** All corpus well-formedness findings across every loaded pack. A no-op
 * (returns []) when `packs` is empty — the graceful-absence contract holds
 * all the way through to the validate scan (NFR-001). */
export function corpusWellFormedFindings(packs: readonly CorpusPack[]): Finding[] {
  const findings: Finding[] = [];
  for (const pack of packs) {
    findings.push(...missingFieldFindings(pack));
    findings.push(...danglingIndexFindings(pack));
    findings.push(...orphanDocumentFindings(pack));
    findings.push(...duplicateIdFindings(pack));
  }
  return findings;
}
