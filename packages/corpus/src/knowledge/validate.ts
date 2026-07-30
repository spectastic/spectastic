/**
 * corpus-well-formed — the folded validate scan for the knowledge corpus
 * (051-knowledge-corpus, T-110, plan D-003 corrected). A CLI `scanX()`
 * wrapper (T-112) calls `loadCorpus()` then this pure function, exactly as
 * `scanEnforceWaivers`/`scanCopyLeak` already do for their own non-HTML
 * checks in `packages/cli/src/commands/validate.ts` — never a
 * `packages/schema/src/rules/*` entry, since that registry is HTML-bound
 * (every rule takes a `ParsedDocument`) and the corpus is plain markdown.
 *
 * Per-pack checks, all at error severity — a written citation or index row
 * either resolves or it doesn't, fully deterministic:
 *  - every document declares its required fields (`id` plus
 *    `REQUIRED_PROVENANCE_FIELDS`) — FR-002/FR-003
 *  - the index and the documents agree bidirectionally: every index row
 *    resolves to a document with a matching id, and every document appears
 *    in the index — FR-004, SC-001
 *  - no two documents in a pack share one `KB-NNN` id — FR-002, P-3
 *  - no two documents in a pack share one pack-internal slug — FR-002 layer
 *    1 (2026-07-26-two-layer-corpus-identity amendment), additive: a no-op
 *    for a pack that hasn't migrated onto slugs yet.
 *
 * `duplicateIdFindings` still checks `KB-NNN` uniqueness *within a pack*, not
 * yet the repo-wide uniqueness FR-002 restated (the array-order collision
 * this whole amendment exists to fix, per the considerations doc §1) — that
 * repurposing is explicitly deferred to `TBD-corpus-identity-migration`
 * (this amendment's §6), landing alongside the pack re-authoring so it
 * doesn't turn an unmigrated pack red today. `corpusRegistryFindings` below
 * is the new, separate, additive check for the project's *root* registry
 * (FR-009) — repo-wide uniqueness lives there once the migration wires a
 * pack's ids through it.
 */
import type { Finding } from '@spectastic/schema';
import { isSingleLayerPack } from './migrate.js';
import { type CorpusDocument, type CorpusPack, KB_ID_RE, type RegistryEntry } from './types.js';

const REGISTRY_FILE = 'knowledge/index.md';

const RULE = 'corpus-well-formed';

function errorFinding(file: string, message: string): Finding {
  return { file, line: 1, column: 1, rule: RULE, severity: 'error', message };
}

/** `corpus-registry-orphan` (061-corpus-ingester FR-007) — warning severity,
 * distinct from `corpus-well-formed`'s error-severity checks: an orphaned
 * reference is a loud, review-worthy loss (the world moved and something
 * vanished from a re-import), never a build-blocking defect. Mirrors 053's
 * `corpus-staleness` posture, not its `corpus-provenance` one. */
function warningFinding(file: string, message: string): Finding {
  return {
    file,
    line: 1,
    column: 1,
    rule: 'corpus-registry-orphan',
    severity: 'warning',
    message,
  };
}

/** Every document with a non-empty `missingFields` (parse.ts already
 * computed the gap; this just turns it into a finding). */
function missingFieldFindings(pack: CorpusPack): Finding[] {
  return pack.documents
    .filter((doc) => doc.missingFields.length > 0)
    .map((doc) =>
      errorFinding(doc.filePath, `${doc.filePath} is missing required field(s): ${doc.missingFields.join(', ')}.`),
    );
}

/** Every index row whose id has no matching document in the pack. */
function danglingIndexFindings(pack: CorpusPack): Finding[] {
  const documentIds = new Set(pack.documents.map((d) => d.id).filter((id): id is string => id !== null));
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
      errorFinding(doc.filePath, `${doc.filePath} (${doc.id}) has no matching row in ${pack.name}'s curated index.`),
    );
}

/** Group documents by id, then flag every group with more than one entry —
 * KB-NNN ids must be unique within a pack (P-3: IDs are contracts).
 *
 * 062-corpus-identity-migration D-003: this is a NO-OP on a migrated
 * (two-layer) pack — a migrated document carries `slug:`, not `id:`, so
 * `doc.id` is empty and the loop below skips it (line: `if (!doc.id) continue`).
 * Repo-wide `KB-NNNN` uniqueness is enforced by `duplicateRegistryIdFindings`
 * over the root registry (FR-008). This per-pack check is retained solely for a
 * still-unmigrated downstream pack that legitimately carries a document `id`;
 * do not delete it until every consumer has migrated
 * (`TBD-resolver-registry-only`'s sibling cleanup). */
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

/** Group documents by pack-internal slug, then flag every group with more
 * than one entry — a slug (FR-002 layer 1) must be unique within its own
 * pack, the pack-owned half of the two-layer id. Additive: a document with
 * no `slug` yet (an unmigrated pack) is skipped, so this is a no-op until a
 * pack actually populates the field. */
function duplicateSlugFindings(pack: CorpusPack): Finding[] {
  const bySlug = new Map<string, CorpusDocument[]>();
  for (const doc of pack.documents) {
    if (!doc.slug) continue;
    const group = bySlug.get(doc.slug) ?? [];
    group.push(doc);
    bySlug.set(doc.slug, group);
  }
  const findings: Finding[] = [];
  for (const [slug, docs] of bySlug) {
    if (docs.length < 2) continue;
    const firstPath = docs[0]?.filePath ?? pack.dirPath;
    const paths = docs.map((d) => d.filePath).join(', ');
    findings.push(
      errorFinding(
        firstPath,
        `Duplicate pack-internal slug "${slug}" in ${paths} — a slug must be unique within its pack.`,
      ),
    );
  }
  return findings;
}

/** A pack that carries reference documents but no `SKILL.md`. 057-portable-domain-skill
 * mandates that "a pack MUST function as a plain Agent Skill (SKILL.md + references/)";
 * enforcement had been missing, so a references-only pack validated clean (065 triage
 * T-003 — `convert` shipped exactly such a pack). Scoped to a pack that actually has
 * documents: an empty directory under `knowledge/` is not yet a pack and isn't flagged. */
function missingSkillFileFindings(pack: CorpusPack): Finding[] {
  if (pack.hasSkillFile || pack.documents.length === 0) return [];
  return [
    errorFinding(
      `${pack.dirPath}/SKILL.md`,
      `Pack "${pack.name}" has reference documents but no SKILL.md — a pack must function as a plain Agent Skill (SKILL.md + references/). Add a SKILL.md declaring the pack's name and slug-map.`,
    ),
  ];
}

/** `corpus-single-layer-deprecated` (066-corpus-single-layer-retire, FR-004)
 * — its own rule name, distinct from `warningFinding`'s `corpus-registry-orphan`
 * (already loosely shared by the orphan AND fragmentation findings above; not
 * widened further here). Warning severity, the "deprecate first, reject
 * later" window (P-9). */
function singleLayerWarningFinding(file: string, message: string): Finding {
  return {
    file,
    line: 1,
    column: 1,
    rule: 'corpus-single-layer-deprecated',
    severity: 'warning',
    message,
  };
}

/** Flags a pack still carrying a single-layer signal (an `id:` document with
 * no `slug:`, or a non-empty pack-local index — `isSingleLayerPack`, the
 * same predicate `migratePack` uses, so the two can never disagree). Never
 * fires on a two-layer pack (NFR-002) — including the repo's own dogfooded
 * `knowledge/` packs, which are already two-layer. */
function singleLayerDeprecatedFindings(pack: CorpusPack): Finding[] {
  if (!isSingleLayerPack(pack)) return [];
  return [
    singleLayerWarningFinding(
      pack.dirPath,
      `Pack "${pack.name}" still carries a single-layer document (a pack-minted id: with no slug:) or a pack-local index.md. Run \`corpus migrate ${pack.name}\` to convert it to the two-layer convention (slug: documents + a root registry row). Single-layer is deprecated and still accepted this phase; a later release will reject it.`,
    ),
  ];
}

/** All corpus well-formedness findings across every loaded pack. A no-op
 * (returns []) when `packs` is empty — the graceful-absence contract holds
 * all the way through to the validate scan (NFR-001). */
export function corpusWellFormedFindings(packs: readonly CorpusPack[]): Finding[] {
  const findings: Finding[] = [];
  for (const pack of packs) {
    findings.push(
      ...missingFieldFindings(pack),
      ...danglingIndexFindings(pack),
      ...orphanDocumentFindings(pack),
      ...duplicateIdFindings(pack),
      ...duplicateSlugFindings(pack),
      ...missingSkillFileFindings(pack),
      ...singleLayerDeprecatedFindings(pack),
    );
  }
  return findings;
}

/** Every registry row missing a required column. Unlike `parseRegistry` (which
 * silently skips a table row whose id fails `KB_ID_RE`, never producing an
 * entry for it), a `RegistryEntry[]` handed to this function isn't
 * guaranteed to have come through that parser at all — a hand-edited
 * registry or a future ingester bug could construct one directly — so
 * nothing about its shape is assumed here or in the checks below. */
function missingRegistryFieldFindings(entries: readonly RegistryEntry[]): Finding[] {
  const findings: Finding[] = [];
  const REQUIRED_REGISTRY_FIELDS = ['marketplace', 'plugin', 'slug', 'title', 'edition', 'path'] as const;
  for (const entry of entries) {
    const missing = REQUIRED_REGISTRY_FIELDS.filter((field) => !entry[field]);
    if (missing.length > 0) {
      findings.push(
        errorFinding(REGISTRY_FILE, `Registry row ${entry.id} is missing required field(s): ${missing.join(', ')}.`),
      );
    }
  }
  return findings;
}

/** Every registry id that isn't shaped `KB-NNNN` — a `KB-` prefix and digits
 * only (`KB_ID_RE`). This is FR-009's opaqueness rule made checkable: a
 * pure-digit suffix cannot encode a pack, plugin, or reference name (the
 * DOI/PID "no semantic meaning" lesson, considerations doc §2) — so a
 * shape failure is exactly an opaqueness failure, not a separate concern.
 * (A row that fails this shape can still reach here: `parseRegistry` skips
 * it silently rather than producing an entry, but nothing guarantees every
 * `RegistryEntry[]` this function sees came through that parser.) */
function malformedIdFindings(entries: readonly RegistryEntry[]): Finding[] {
  const findings: Finding[] = [];
  for (const entry of entries) {
    if (!KB_ID_RE.test(entry.id)) {
      findings.push(
        errorFinding(
          REGISTRY_FILE,
          `Registry id "${entry.id}" is not shaped KB-NNNN (a KB- prefix and digits only) — an id must be opaque, encoding no pack or reference name (FR-009).`,
        ),
      );
    }
  }
  return findings;
}

/** Every `KB-NNNN` appearing more than once across the whole registry — the
 * repo-wide uniqueness FR-009 mandates, and the direct fix for the cross-pack
 * `KB-001` collision that motivated this amendment (`resolveCitation` picking
 * the first match by array order, considerations doc §1). */
function duplicateRegistryIdFindings(entries: readonly RegistryEntry[]): Finding[] {
  const byId = new Map<string, RegistryEntry[]>();
  for (const entry of entries) {
    const group = byId.get(entry.id) ?? [];
    group.push(entry);
    byId.set(entry.id, group);
  }
  const findings: Finding[] = [];
  for (const [id, group] of byId) {
    if (group.length < 2) continue;
    const paths = group.map((e) => e.path).join(', ');
    findings.push(
      errorFinding(REGISTRY_FILE, `Duplicate registry id ${id} in ${paths} — a KB-NNNN must be repo-unique.`),
    );
  }
  return findings;
}

/** Every registry row flagged `status=orphaned` (061-corpus-ingester FR-007)
 * — a reference a prior import registered but a re-import no longer fetches.
 * Warning severity: loud, never a build-blocker (the row is never dropped by
 * the ingester either way; this is purely the finding it raises). */
function orphanedRegistryFindings(entries: readonly RegistryEntry[]): Finding[] {
  const findings: Finding[] = [];
  for (const entry of entries) {
    if (entry.status === 'orphaned') {
      findings.push(
        warningFinding(
          REGISTRY_FILE,
          `Registry row ${entry.id} (${entry.slug}) is orphaned — a re-import no longer fetches it. Reconcile or leave it flagged; it is never silently dropped.`,
        ),
      );
    }
  }
  return findings;
}

/** Every `(plugin, slug)` reference registered under MORE THAN ONE
 * marketplace — an identity-fragmentation signal (061 Phase 8 T-1004, the
 * Risk-1 mitigation reconciled to 063's `corpus.marketplace`). The install
 * door pins a marketplace-less re-import to the existing row's marketplace
 * (T-1002), so this can't arise from import; a hand-edit or a manually-set
 * `corpus.marketplace` change between imports can still fragment the same
 * pack into two `KB-NNNN`s under two namespaces. Warning, not error: the rows
 * are individually well-formed and each resolves; the concern is that a
 * consumer citing "this pack" now has two ids for it. */
function fragmentedIdentityFindings(entries: readonly RegistryEntry[]): Finding[] {
  const byPluginSlug = new Map<string, Set<string>>();
  for (const entry of entries) {
    const key = `${entry.plugin} ${entry.slug}`;
    const marketplaces = byPluginSlug.get(key) ?? new Set<string>();
    marketplaces.add(entry.marketplace);
    byPluginSlug.set(key, marketplaces);
  }
  const findings: Finding[] = [];
  for (const [key, marketplaces] of byPluginSlug) {
    if (marketplaces.size < 2) continue;
    const [plugin, slug] = key.split(' ');
    findings.push(
      warningFinding(
        REGISTRY_FILE,
        `Reference ${plugin}/${slug} is registered under ${marketplaces.size} marketplaces (${[...marketplaces].join(', ')}) — an identity fragmentation. A consumer citing this pack now has two KB-NNNN ids for it; reconcile to one marketplace namespace.`,
      ),
    );
  }
  return findings;
}

/** All root-registry findings (FR-007/FR-009): required columns, opaqueness,
 * repo-wide `KB-NNNN` uniqueness (all error severity), orphan-flagging and
 * identity-fragmentation (warning severity). A no-op (returns []) when no
 * registry exists — `entries` is simply empty in that case (no
 * `knowledge/index.md` to parse), so the graceful-absence contract holds the
 * same way `corpusWellFormedFindings`' does for an empty `packs` array
 * (NFR-001). Kept separate from `corpusWellFormedFindings` because a registry
 * spans every pack in the project, not one — there is no single `CorpusPack`
 * to attach it to. */
export function corpusRegistryFindings(entries: readonly RegistryEntry[]): Finding[] {
  return [
    ...missingRegistryFieldFindings(entries),
    ...malformedIdFindings(entries),
    ...duplicateRegistryIdFindings(entries),
    ...orphanedRegistryFindings(entries),
    ...fragmentedIdentityFindings(entries),
  ];
}
