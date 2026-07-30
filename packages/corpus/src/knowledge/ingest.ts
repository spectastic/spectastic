/**
 * The corpus ingester's registration backbone (061-corpus-ingester, plan
 * D-001/D-004/D-005).
 *
 * Every acquisition door (`corpus import` / `interview` / `source`)
 * converges here: assign a repo-unique, opaque, never-reused `KB-NNNN` and
 * merge the new row into the root registry non-destructively. This module
 * owns only the backbone; the install door's own orchestration (fetch →
 * convert → allocate/merge → write the SKILL.md map) lands in US1 (T-111).
 *
 * Deliberately reuses 056's `adapt.ts` conversion primitives rather than
 * duplicating them — this file is the *registry* half, `adapt.ts` stays the
 * *conversion* half (plan D-003).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import type { PackFetcher } from '../providers/pack-fetcher.js';
import { deriveProvenance, deriveTitleAndDescription } from './adapt.js';
import {
  parseRegistry,
  parseSkillSlugMap,
  renderRegistryTable,
  renderSkillSlugMapTable,
  type SkillSlugMapEntry,
  SLUG_MAP_HEADER,
} from './index-format.js';
import { parseCorpusDocument } from './parse.js';
import { syncMarketplaceManifest } from './publish.js';
import type { RegistryEntry } from './types.js';
import { KB_ID_RE } from './types.js';

/** The highest numeric suffix among a set of registry entries (0 if none
 * match — a fresh registry allocates starting at KB-0001). Reads the WHOLE
 * repo-wide registry, not a per-pack slice (061 FR-001, distinct from
 * `adapt.ts`'s per-pack `maxExistingIdNum`) — and counts every entry
 * regardless of `status`, so an orphaned row's id is never reused (FR-003). */
function maxExistingRegistryIdNum(registry: readonly RegistryEntry[]): number {
  let max = 0;
  for (const entry of registry) {
    if (!KB_ID_RE.test(entry.id)) continue;
    const num = Number(entry.id.slice('KB-'.length));
    if (num > max) max = num;
  }
  return max;
}

/**
 * Allocate `count` sequential, never-colliding, repo-unique `KB-NNNN` ids,
 * continuing from the registry's current highest id (FR-001/FR-003, plan
 * D-004). Zero-padded to at least 4 digits (the 061 baseline — `KB_ID_RE`
 * already admits `\d{3,}`, so a wider baseline costs nothing). Deterministic
 * given a fixed `registry` — no clock reads (NFR-001).
 */
export function allocateRegistryIds(registry: readonly RegistryEntry[], count: number): string[] {
  const start = maxExistingRegistryIdNum(registry) + 1;
  return Array.from({ length: count }, (_, i) => `KB-${String(start + i).padStart(4, '0')}`);
}

/** The `(marketplace, plugin, slug)` re-import anchor key for a registry
 * entry (FR-004) — the coordinate a re-import resolves against, distinct
 * from the assigned `KB-NNNN` itself. */
function anchorKey(entry: Pick<RegistryEntry, 'marketplace' | 'plugin' | 'slug'>): string {
  return `${entry.marketplace} ${entry.plugin} ${entry.slug}`;
}

/**
 * Merge a fresh set of registry rows into whatever the root registry
 * already had (FR-002, plan D-004): keyed on the `(marketplace, plugin,
 * slug)` anchor, an existing row's non-empty cell wins over a freshly
 * re-derived one for the same anchor, so a hand-edited title/edition
 * survives a re-run untouched (NFR-003) — mirrors `adapt.ts`'s
 * `mergeIndexRows` precedent, keyed on the anchor rather than the id (both
 * identify the same row once assigned, but the anchor is what FR-004 anchors
 * a re-import on). Deterministic — no clock reads (NFR-001).
 */
export function mergeRegistryRows(
  existing: readonly RegistryEntry[],
  fresh: readonly RegistryEntry[],
): RegistryEntry[] {
  const byAnchor = new Map<string, RegistryEntry>();
  for (const row of fresh) byAnchor.set(anchorKey(row), row);
  for (const row of existing) {
    const current = byAnchor.get(anchorKey(row));
    if (!current) {
      byAnchor.set(anchorKey(row), row);
      continue;
    }
    byAnchor.set(anchorKey(row), {
      id: row.id || current.id,
      marketplace: row.marketplace || current.marketplace,
      plugin: row.plugin || current.plugin,
      slug: row.slug || current.slug,
      title: row.title || current.title,
      edition: row.edition || current.edition,
      path: row.path || current.path,
      status: row.status || current.status || '',
    });
  }
  return [...byAnchor.values()];
}

/** Non-destructive merge for a pack's `SKILL.md`-inlined slug map, keyed on
 * `slug` alone (a pack-local concern — no `KB-NNNN`, no repo-wide anchor).
 * Same hand-edit-wins precedence as `mergeRegistryRows`. */
function mergeSlugMapRows(
  existing: readonly SkillSlugMapEntry[],
  fresh: readonly SkillSlugMapEntry[],
): SkillSlugMapEntry[] {
  const bySlug = new Map<string, SkillSlugMapEntry>();
  for (const row of fresh) bySlug.set(row.slug, row);
  for (const row of existing) {
    const current = bySlug.get(row.slug);
    if (!current) {
      bySlug.set(row.slug, row);
      continue;
    }
    bySlug.set(row.slug, {
      slug: row.slug,
      title: row.title || current.title,
      description: row.description || current.description,
      edition: row.edition || current.edition,
      path: row.path || current.path,
    });
  }
  return [...bySlug.values()];
}

/** A two-layer document's frontmatter carries `slug` (FR-002's layer-1
 * identity), never a pack-minted `id` — distinct from `adapt.ts`'s own
 * `renderDocument`, which stamps the retired per-pack `id` field. */
function renderTwoLayerDocument(slug: string, provenance: Record<string, string>, body: string): string {
  const yamlBlock = stringifyYaml({ slug, ...provenance }).trimEnd();
  return `---\n${yamlBlock}\n---\n\n${body}\n`;
}

/** Strip a PRIOR rendering of the slug-map table from an existing `SKILL.md`
 * body, keeping only whatever prose sits above it (066-corpus-single-layer-
 * retire: fixes `registerDocument` accumulating one stale table per write
 * when called repeatedly against the same pack in one run — `adapt`'s new
 * per-file loop is the first caller to do that; `installPack`'s own
 * once-per-invocation SKILL.md write never hit this). Locates the table by
 * its fixed header line (`SLUG_MAP_HEADER`, always emitted verbatim by
 * `renderSkillSlugMapTable`) rather than trying to reparse table rows. */
function stripExistingSlugMapTable(body: string): string {
  const idx = body.indexOf(SLUG_MAP_HEADER);
  return idx === -1 ? body.trimEnd() : body.slice(0, idx).trimEnd();
}

/** The body's first non-heading, non-empty line, truncated to a slug-map
 * description length — the discoverability blurb for a hand-supplied document
 * (interview/source) whose body carries no `# heading` for
 * `deriveTitleAndDescription` to key off. Returns `''` for an empty body. */
function firstBodyParagraph(body: string): string {
  const DESCRIPTION_LEN = 137; // matches adapt.ts's TITLE_FALLBACK_LEN
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    return trimmed.length > DESCRIPTION_LEN ? `${trimmed.slice(0, DESCRIPTION_LEN)}...` : trimmed;
  }
  return '';
}

/** Marks an installed document as not yet spot-checked by this project — the
 * install door's own guard (spec FR-010: "citable once a human spot-checks
 * the conversion"), distinct from whatever `status` the source pack itself
 * declared. Deliberately overridden regardless of the source's own value; the
 * source's claim is about ITS provenance, this is about whether THIS PROJECT
 * has reviewed it yet. */
export const NOT_YET_SPOT_CHECKED_STATUS = 'not-yet-spot-checked';

/** The interview door's citability guard (FR-010) — an interviewed document
 * is not citable until the subject-matter expert signs off on the captured
 * text. Distinct from the install door's guard: a different door, a
 * different guard, the same underlying "not yet reviewed" discipline. */
export const NOT_CITABLE_UNTIL_SIGNED_OFF_STATUS = 'not-citable-until-signed-off';

/** The source door's citability guard (FR-010) — a sourced document is not
 * citable until a human confirms the fetch/ingestion. */
export const NOT_CITABLE_UNTIL_CONFIRMED_STATUS = 'not-citable-until-confirmed';

/** Split a `<plugin>@<marketplace>` acquisition coordinate (spec FR-008). */
export function parseCoordinate(coordinate: string): {
  plugin: string;
  marketplace: string;
} {
  const at = coordinate.indexOf('@');
  if (at === -1) return { plugin: coordinate, marketplace: '' };
  return {
    plugin: coordinate.slice(0, at),
    marketplace: coordinate.slice(at + 1),
  };
}

export interface InstallInput {
  /** The `PackFetcher` seam (plan D-002) — real, stub, or `--from` local. */
  fetcher: PackFetcher;
  /** `<plugin>@<marketplace>` (spec FR-008). */
  coordinate: string;
  /** Absolute path to the project's `knowledge/` directory. */
  knowledgeDir: string;
  /** The source marketplace's `renames` map (a former plugin name → its
   * current one), when known to the caller — FR-006's migration key. A
   * re-import under the renamed name still resolves to the row registered
   * under the old one. Optional: absent (no known renames) is a no-op. */
  renames?: Record<string, string>;
  /** This corpus's OWN publish identity (`corpus.marketplace`,
   * 063-corpus-discoverability FR-006) — distinct from the registry row's
   * `marketplace` column above, which is import PROVENANCE (where a
   * reference came from). When given, `installPack` re-syncs
   * `marketplace.json` after writing the registry (FR-003). Optional: a
   * caller with no corpus config yet (or a test with no interest in the
   * manifest) gets no sync side effect — the CLI always supplies it. */
  corpusMarketplaceName?: string;
}

export interface InstallResult {
  plugin: string;
  marketplace: string;
  /** `KB-NNNN` ids newly registered this run. */
  written: string[];
  /** `KB-NNNN` ids already registered at this anchor, left untouched (idempotent, NFR-003). */
  skipped: string[];
  /** `KB-NNNN` ids whose document was superseded-by-append this run (FR-005) — same id, bumped edition, prior text retained. */
  superseded: string[];
  /** `KB-NNNN` ids flagged `orphaned` this run — present before, absent from this re-import (FR-007). */
  orphaned: string[];
}

/** 061 FR-013 (T-1005): preserve a source pack's ALREADY-retained superseded
 * editions on import. The install loop reads only top-level `references/*.md`,
 * so a source's `references/superseded/*.md` would otherwise be silently
 * dropped — dangling any edition-pinned citation to a prior edition (052
 * FR-003). Copies each verbatim (the `<slug>@<edition>.md` filename already
 * matches what `loadSuperseded` parses; no rename), never overwriting one
 * already present (idempotent). Distinct from `installPack`'s own
 * supersede-by-append branch, which creates a NEW superseded file when a live
 * edition is bumped. */
function preserveSourceSuperseded(sourceReferencesDir: string, destSupersededDir: string): void {
  const sourceSupersededDir = join(sourceReferencesDir, 'superseded');
  if (!existsSync(sourceSupersededDir)) return;
  mkdirSync(destSupersededDir, { recursive: true });
  for (const f of readdirSync(sourceSupersededDir).filter((n) => n.endsWith('.md'))) {
    const dest = join(destSupersededDir, f);
    if (!existsSync(dest)) writeFileSync(dest, readFileSync(join(sourceSupersededDir, f), 'utf8'), 'utf8');
  }
}

/** The plugin name(s) an existing registry row may be filed under for this
 * install — its current name, plus any former name a rename map still
 * migrates from (FR-006). */
function candidatePluginNames(plugin: string, renames: Record<string, string>): string[] {
  const formerNames = Object.entries(renames)
    .filter(([, current]) => current === plugin)
    .map(([former]) => former);
  return [plugin, ...formerNames];
}

/**
 * Install door orchestration (US1/US2, FR-001/FR-002/FR-004/FR-005/FR-006/
 * FR-007/FR-008/FR-009). Fetches the pack via the seam, converts each of its
 * `references/*.md` documents through 056's never-fabricate primitives
 * (reused, not duplicated — plan D-003), assigns/merges registry rows via
 * the backbone above, and merges the pack's own `SKILL.md` slug map.
 *
 * A reference already registered at its `(marketplace, plugin, slug)`
 * anchor — or at a renamed former plugin name, via `renames` — is either
 * left untouched (same edition, idempotent, NFR-003) or superseded-by-append
 * (a newer edition: same `KB-NNNN`, prior text retained under
 * `references/superseded/`, FR-005). A previously-registered reference this
 * pack no longer fetches is flagged `orphaned`, never deleted (FR-007).
 */
export async function installPack(input: InstallInput): Promise<InstallResult> {
  const { plugin, marketplace: coordinateMarketplace } = parseCoordinate(input.coordinate);
  const renames = input.renames ?? {};
  const sourceDir = await input.fetcher.fetch(input.coordinate);
  const sourceReferencesDir = join(sourceDir, 'references');

  const packDir = join(input.knowledgeDir, plugin);
  const referencesDir = join(packDir, 'references');
  const supersededDir = join(referencesDir, 'superseded');
  mkdirSync(referencesDir, { recursive: true });

  const registryPath = join(input.knowledgeDir, 'index.md');
  const existingRegistry = existsSync(registryPath) ? parseRegistry(readFileSync(registryPath, 'utf8')) : [];

  // 061 FR-008 marketplace-optional local mode (reconciled to 063's
  // corpus.marketplace per 063 D-003): a coordinate that omits @marketplace
  // — an in-repo pack never fetched from a marketplace — files under a
  // resolved namespace instead of an empty column. T-1002 pin: reuse an
  // existing row's marketplace for this plugin FIRST, so a later
  // corpus.marketplace change never silently re-keys (plugin, slug) and mints
  // a second KB-NNNN; else the caller's corpus.marketplace
  // (`corpusMarketplaceName`); else the `local` sentinel (never an empty
  // required column).
  const marketplace =
    coordinateMarketplace ||
    existingRegistry.find((e) => e.plugin === plugin)?.marketplace ||
    input.corpusMarketplaceName ||
    'local';

  const existingByAnchor = new Map(existingRegistry.map((e) => [anchorKey(e), e]));

  /** Resolve an existing row for this slug — the current plugin name first,
   * then any former name the renames map still migrates from (FR-006). */
  function findExisting(slug: string): RegistryEntry | undefined {
    for (const candidate of candidatePluginNames(plugin, renames)) {
      const found = existingByAnchor.get(anchorKey({ marketplace, plugin: candidate, slug }));
      if (found) return found;
    }
    return undefined;
  }

  const sourceFiles = existsSync(sourceReferencesDir)
    ? readdirSync(sourceReferencesDir)
        .filter((f) => f.endsWith('.md'))
        .sort()
    : [];
  const sourceSlugs = new Set(sourceFiles.map((f) => f.replace(/\.md$/, '')));

  const written: string[] = [];
  const skipped: string[] = [];
  const superseded: string[] = [];
  const staleAnchors = new Set<string>(); // renamed-from rows to drop from the merged registry
  const freshRows: RegistryEntry[] = [];
  const freshSlugRows: SkillSlugMapEntry[] = [];

  for (const filename of sourceFiles) {
    const slug = filename.replace(/\.md$/, '');
    const raw = readFileSync(join(sourceReferencesDir, filename), 'utf8');
    const parsed = parseCorpusDocument(raw, filename);
    const existing = findExisting(slug);

    if (!existing) {
      const [id] = allocateRegistryIds([...existingRegistry, ...freshRows], 1);
      const provenance = deriveProvenance(raw, {
        ...parsed.provenance,
        status: NOT_YET_SPOT_CHECKED_STATUS,
      });
      const { title, description } = deriveTitleAndDescription(parsed.body, slug);
      writeFileSync(join(referencesDir, filename), renderTwoLayerDocument(slug, provenance, parsed.body), 'utf8');
      freshRows.push({
        id: id!,
        marketplace,
        plugin,
        slug,
        title,
        edition: provenance.edition,
        path: `${plugin}/references/${filename}`,
        status: '',
      });
      freshSlugRows.push({
        slug,
        title,
        description,
        edition: provenance.edition,
        path: `references/${filename}`,
      });
      written.push(id!);
      continue;
    }

    const incomingEdition = parsed.provenance.edition;
    const sameEdition = !incomingEdition || incomingEdition === existing.edition;
    if (sameEdition && existing.plugin === plugin) {
      skipped.push(existing.id); // truly unchanged — idempotent no-op (NFR-003)
      continue;
    }

    // A newer edition, and/or a renamed plugin migrating in: supersede the
    // prior text (if a rename, there may be no prior file under the NEW
    // plugin dir yet — moving what actually exists on disk, never guessing).
    // The old row is dropped from the merge unconditionally (not just on
    // rename) — mergeRegistryRows' hand-edit-wins precedence would otherwise
    // let the OLD edition win over the very bump this branch exists to make.
    staleAnchors.add(anchorKey(existing));
    const priorPath = join(input.knowledgeDir, existing.plugin, 'references', filename);
    if (existsSync(priorPath) && existing.edition) {
      mkdirSync(supersededDir, { recursive: true });
      writeFileSync(join(supersededDir, `${slug}@${existing.edition}.md`), readFileSync(priorPath, 'utf8'), 'utf8');
    }

    const provenance = deriveProvenance(raw, {
      ...parsed.provenance,
      status: NOT_YET_SPOT_CHECKED_STATUS,
    });
    const { title, description } = deriveTitleAndDescription(parsed.body, slug);
    writeFileSync(join(referencesDir, filename), renderTwoLayerDocument(slug, provenance, parsed.body), 'utf8');
    freshRows.push({
      id: existing.id,
      marketplace,
      plugin,
      slug,
      title,
      edition: provenance.edition,
      path: `${plugin}/references/${filename}`,
      status: '',
    });
    freshSlugRows.push({
      slug,
      title,
      description,
      edition: provenance.edition,
      path: `references/${filename}`,
    });
    superseded.push(existing.id);
  }

  preserveSourceSuperseded(sourceReferencesDir, supersededDir);

  // Orphans: rows this pack (current name or any renamed-from name) owns,
  // whose slug this fetch no longer carries — flagged, never deleted (FR-007).
  // Only a row that WASN'T already orphaned is reported, so a re-import over
  // an already-orphaned row doesn't repeat the finding (idempotent, NFR-003).
  const ownedPluginNames = new Set(candidatePluginNames(plugin, renames));
  const orphaned: string[] = [];
  const survivingExisting = existingRegistry
    .filter((e) => !staleAnchors.has(anchorKey(e)))
    .map((e) => {
      const isOrphan = e.marketplace === marketplace && ownedPluginNames.has(e.plugin) && !sourceSlugs.has(e.slug);
      if (isOrphan && e.status !== 'orphaned') orphaned.push(e.id);
      return isOrphan ? { ...e, status: 'orphaned' as const } : e;
    });
  const mergedRegistry = mergeRegistryRows(survivingExisting, freshRows);
  writeFileSync(registryPath, renderRegistryTable(mergedRegistry), 'utf8');

  const skillPath = join(packDir, 'SKILL.md');
  const existingSlugRows = existsSync(skillPath) ? parseSkillSlugMap(readFileSync(skillPath, 'utf8')) : [];
  const mergedSlugRows = mergeSlugMapRows(existingSlugRows, freshSlugRows);
  if (!existsSync(skillPath)) {
    const frontmatter = stringifyYaml({
      name: plugin,
      description: `Domain knowledge imported from ${marketplace}.`,
    }).trimEnd();
    writeFileSync(
      skillPath,
      `---\n${frontmatter}\n---\n\n# ${plugin}\n\n${renderSkillSlugMapTable(mergedSlugRows)}`,
      'utf8',
    );
  } else if (freshSlugRows.length > 0) {
    // A new or updated reference against an already-existing SKILL.md (a
    // re-import, US2) — append the merged slug map so it's discoverable
    // without disturbing the file's existing prose above it.
    const body = readFileSync(skillPath, 'utf8');
    writeFileSync(skillPath, `${body.trimEnd()}\n\n${renderSkillSlugMapTable(mergedSlugRows)}`, 'utf8');
  }

  // 063-corpus-discoverability FR-003: keep marketplace.json in sync — AFTER
  // the SKILL.md write above, so a brand-new pack's real (if generic)
  // description is what gets synced, never a stale "SKILL.md doesn't exist
  // yet" fallback from reading too early (a real ordering bug this comment
  // now guards against). No-op when the caller supplies no corpus identity.
  if (input.corpusMarketplaceName) {
    syncMarketplaceManifest({
      marketplaceName: input.corpusMarketplaceName,
      knowledgeDir: input.knowledgeDir,
    });
  }

  return { plugin, marketplace, written, skipped, superseded, orphaned };
}

export interface RegisterDocumentInput {
  /** Absolute path to the project's `knowledge/` directory. */
  knowledgeDir: string;
  marketplace: string;
  plugin: string;
  slug: string;
  title: string;
  /** The document body (no frontmatter — this function derives it). */
  body: string;
  /** The door-specific provenance `origin` — e.g. `interview: <role>, <date>`
   * or the fetched URL + retrieval date (FR-010). Never fabricated: the
   * caller supplies exactly what it read/captured. */
  origin: string;
  /** The door-specific citability guard — e.g.
   * `not-citable-until-signed-off` or `not-citable-until-confirmed` (FR-010). */
  status: string;
  /** This corpus's OWN publish identity (`corpus.marketplace`,
   * 063-corpus-discoverability FR-006) — see `InstallInput`'s field of the
   * same name for the full rationale. Optional, same default (no sync). */
  corpusMarketplaceName?: string;
  /** The tool that produced this document, for the provenance `converter`
   * field — `convert` passes its converter (065 FR-004); other doors leave it
   * unset (defaults to the never-fabricate `TODO`). */
  converter?: string;
  /** A pre-computed `content-hash` to pin instead of hashing the body —
   * `convert` pins the SOURCE file's bytes (065 FR-004). Unset ⇒ the body is
   * hashed as before. */
  contentHash?: string;
  /** An explicit slug-map description, overriding the first-body-paragraph
   * derivation — `convert`'s optional `--description` (065 FR-007). */
  description?: string;
  /** Provenance overrides `migrate` (066-corpus-single-layer-retire) needs to
   * carry a single-layer document's real edition/license/origin-url forward
   * rather than resetting them to TODO — the same never-fabricate discipline
   * `converter`/`contentHash` above already follow, widened to the three
   * fields those didn't yet cover. Unset ⇒ each falls back to
   * `deriveProvenance`'s own TODO default, as before. */
  edition?: string;
  license?: string;
  originUrl?: string;
}

/**
 * Register one hand-supplied document through the same backbone `install`
 * uses (FR-010's "every door produces the identical registered artifact").
 * Shared by the `interview` and `source` doors — each differs only in the
 * `origin`/`status` it passes in, exactly as the spec requires. Not used by
 * `install`, which registers a whole fetched pack's worth of documents at
 * once; this is the single-document primitive the lighter doors need.
 */
export function registerDocument(input: RegisterDocumentInput): { id: string } {
  const { knowledgeDir, marketplace, plugin, slug, title, body, origin, status, corpusMarketplaceName } = input;
  const packDir = join(knowledgeDir, plugin);
  const referencesDir = join(packDir, 'references');
  mkdirSync(referencesDir, { recursive: true });

  const registryPath = join(knowledgeDir, 'index.md');
  const existingRegistry = existsSync(registryPath) ? parseRegistry(readFileSync(registryPath, 'utf8')) : [];

  const [id] = allocateRegistryIds(existingRegistry, 1);
  const provenance = deriveProvenance(body, {
    origin,
    status,
    ...(input.converter !== undefined ? { converter: input.converter } : {}),
    ...(input.contentHash !== undefined ? { 'content-hash': input.contentHash } : {}),
    ...(input.edition !== undefined ? { edition: input.edition } : {}),
    ...(input.license !== undefined ? { license: input.license } : {}),
    ...(input.originUrl !== undefined ? { 'origin-url': input.originUrl } : {}),
  });
  const filename = `${slug}.md`;

  writeFileSync(join(referencesDir, filename), renderTwoLayerDocument(slug, provenance, body), 'utf8');

  const freshRow: RegistryEntry = {
    id: id!,
    marketplace,
    plugin,
    slug,
    title,
    edition: provenance.edition,
    // Corpus-root-relative, matching installPack + loadCorpus (062 triage T-002).
    path: `${plugin}/references/${filename}`,
    status: '',
  };
  const mergedRegistry = mergeRegistryRows(existingRegistry, [freshRow]);
  writeFileSync(registryPath, renderRegistryTable(mergedRegistry), 'utf8');

  const skillPath = join(packDir, 'SKILL.md');
  // Derive the slug-map description from the body's first paragraph rather than
  // leaving it blank — a blank cell makes the pack's own map undiscoverable. A
  // hand-supplied interview/source body is heading-less prose (its title comes
  // in via the caller), so `deriveTitleAndDescription` — which only reads the
  // line after a `# heading` — returns blank here; the first-paragraph fallback
  // is what actually fills the cell.
  const description = input.description ?? firstBodyParagraph(body);
  const freshSlugRow: SkillSlugMapEntry = {
    slug,
    title,
    description,
    edition: provenance.edition,
    path: `references/${filename}`,
  };
  const existingSlugRows = existsSync(skillPath) ? parseSkillSlugMap(readFileSync(skillPath, 'utf8')) : [];
  const mergedSlugRows = mergeSlugMapRows(existingSlugRows, [freshSlugRow]);
  if (!existsSync(skillPath)) {
    const frontmatter = stringifyYaml({
      name: plugin,
      description: `Domain knowledge for ${plugin}.`,
    }).trimEnd();
    writeFileSync(
      skillPath,
      `---\n${frontmatter}\n---\n\n# ${plugin}\n\n${renderSkillSlugMapTable(mergedSlugRows)}`,
      'utf8',
    );
  } else {
    const skillBody = readFileSync(skillPath, 'utf8');
    const prose = stripExistingSlugMapTable(skillBody);
    writeFileSync(skillPath, `${prose}\n\n${renderSkillSlugMapTable(mergedSlugRows)}`, 'utf8');
  }

  // 063-corpus-discoverability FR-003: keep marketplace.json in sync — AFTER
  // the SKILL.md write above, for the same real-ordering-bug reason
  // installPack's own sync call moved (see its comment). No-op when the
  // caller supplies no corpus identity.
  if (corpusMarketplaceName) {
    syncMarketplaceManifest({
      marketplaceName: corpusMarketplaceName,
      knowledgeDir,
    });
  }

  return { id: id! };
}
