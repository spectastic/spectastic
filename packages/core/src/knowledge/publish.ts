/**
 * Corpus discoverability — the marketplace.json render + sync backbone
 * (063-corpus-discoverability, plan D-001). Sits beside `pack-agnostic.ts`'s
 * existing `readMarketplaceManifest` (052/057/061): that reads a manifest;
 * this writes/keeps one in sync from the root registry, so a corpus is
 * self-describing without a hand-written manifest.
 *
 * `renderMarketplaceManifest` derives the manifest shape from a marketplace
 * name plus the registry rows a corpus already has (FR-002);
 * `syncMarketplaceManifest` merges that over whatever manifest already
 * exists at the corpus root (FR-003) — a plugin's `source`/`description`
 * always reflect their real source of truth (the registry; the pack's own
 * `SKILL.md`) rather than a frozen stale copy, while the manifest-only
 * top-level `owner` is hand-edit-protected (see `mergeManifest`'s own
 * docstring for why the two fields get different policies); `publishCorpus`
 * is the `corpus publish` door's primitive — generate-or-refresh a corpus's
 * manifest end to end (FR-004).
 *
 * All three take an explicit absolute `knowledgeDir` rather than assuming the
 * hardcoded `knowledge/` this package's OTHER loaders use (`index.ts`'s
 * `KNOWLEDGE_DIR` constant) — so this module honours a configured
 * `corpus.root` for the one surface 063 actually specifies (where the
 * manifest itself lives). Retrofitting `loadCorpus`/`loadRegistry`/
 * `installPack` to read from a configurable root instead of the hardcoded
 * constant is a separate, larger change 063 does not cover — flagged as a
 * follow-on, not silently assumed done.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRegistry } from './index-format.js';
import { skillDescription } from './pack-agnostic.js';
import type { RegistryEntry } from './types.js';

/** One entry in a `marketplace.json`'s `plugins[]` — mirrors the read-side
 * `MarketplacePluginInfo` shape (pack-agnostic.ts), plus `description`, since
 * a manifest ENTRY is written from a title/description a pack derives, while
 * the read side never needed to surface it. */
export interface MarketplacePluginEntry {
  name: string;
  source: string;
  description: string;
}

/** The full `marketplace.json` shape this module renders/syncs. */
export interface MarketplaceManifest {
  name: string;
  owner: { name: string };
  plugins: MarketplacePluginEntry[];
}

export interface RenderMarketplaceManifestInput {
  /** The corpus's marketplace name (`corpus.marketplace`, FR-006). */
  marketplaceName: string;
  /** Absolute path to the project's corpus root (`corpus.root`, default `knowledge`). */
  knowledgeDir: string;
}

/** Every distinct pack (`plugin`) name in the root registry, in first-seen
 * order — the registry's own `marketplace` column is import PROVENANCE (where
 * a reference came from), orthogonal to what THIS corpus publishes itself as;
 * a manifest lists every pack physically present, regardless of where each
 * one's references were originally imported from. */
function distinctPlugins(registry: readonly RegistryEntry[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of registry) {
    if (seen.has(row.plugin)) continue;
    seen.add(row.plugin);
    out.push(row.plugin);
  }
  return out;
}

function loadRegistryAt(knowledgeDir: string): RegistryEntry[] {
  const registryPath = join(knowledgeDir, 'index.md');
  if (!existsSync(registryPath)) return [];
  return parseRegistry(readFileSync(registryPath, 'utf8'));
}

/**
 * Render the manifest shape from a marketplace name plus every distinct pack
 * in the corpus root's registry (FR-002). A pack's `description` is read
 * from its own `SKILL.md` (never fabricated, NFR-002) — falling back to a
 * plain, non-fabricated template (the same one `ingest.ts`'s
 * `registerDocument` already uses for a fresh pack's own `SKILL.md`) when the
 * pack has no real discovery description yet, rather than inventing specific
 * claims. Deterministic (NFR-001): sorted by plugin name, no clock/network read.
 */
export function renderMarketplaceManifest(input: RenderMarketplaceManifestInput): MarketplaceManifest {
  const { marketplaceName, knowledgeDir } = input;
  const registry = loadRegistryAt(knowledgeDir);
  const plugins: MarketplacePluginEntry[] = distinctPlugins(registry)
    .map((plugin) => {
      const skillPath = join(knowledgeDir, plugin, 'SKILL.md');
      const raw = existsSync(skillPath) ? readFileSync(skillPath, 'utf8') : '';
      const description = skillDescription(raw) ?? `Domain knowledge for ${plugin}.`;
      return { name: plugin, source: `./${plugin}`, description };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { name: marketplaceName, owner: { name: marketplaceName }, plugins };
}

function readExistingManifest(knowledgeDir: string): MarketplaceManifest | null {
  const path = join(knowledgeDir, 'marketplace.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as MarketplaceManifest;
  } catch {
    return null;
  }
}

/**
 * Merge a freshly-rendered manifest over an existing one. Two different
 * policies, deliberately:
 *
 *  - Top-level `name`/`owner`: existing wins when set — genuine manifest-only
 *    curation with no other source to stay in sync with, mirroring
 *    `mergeRegistryRows`' hand-edit-wins precedent.
 *  - A plugin's `source`/`description`: ALWAYS the fresh value for any
 *    plugin still present in the registry — both are derived facts with a
 *    real source of truth elsewhere (the registry path; the pack's own
 *    `SKILL.md`), so "protecting" a stale copy would silently desync the
 *    manifest from the very SKILL.md a maintainer just fixed. A curator who
 *    wants a different discovery blurb edits the pack's `SKILL.md` — the one
 *    place both the manifest and the Agent Skill surface read it from —
 *    rather than the generated manifest. (Found by dogfooding T-312: a
 *    pack's early generic `SKILL.md` description got hand-corrected, but the
 *    OLD sync's "existing wins" policy re-shipped the stale text forever.)
 *  - A plugin the existing manifest lists but the fresh render no longer
 *    derives (removed from the registry) is KEPT, never silently dropped —
 *    mirroring the registry's own orphan-flag-don't-delete philosophy. This
 *    is the only case an existing plugin entry survives verbatim.
 *
 * `null` existing → the fresh render, verbatim.
 */
function mergeManifest(existing: MarketplaceManifest | null, fresh: MarketplaceManifest): MarketplaceManifest {
  if (!existing) return fresh;
  const name = existing.name || fresh.name;
  const owner = existing.owner?.name ? existing.owner : fresh.owner;
  const byName = new Map(fresh.plugins.map((p) => [p.name, p]));
  for (const row of existing.plugins ?? []) {
    if (!byName.has(row.name)) byName.set(row.name, row); // orphan: no longer in the registry, keep verbatim
  }
  return { name, owner, plugins: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

export interface SyncMarketplaceManifestInput extends RenderMarketplaceManifestInput {}

/**
 * Render + merge + write `<knowledgeDir>/marketplace.json` (FR-003). Called
 * after every registry-writing path so the manifest never drifts from
 * `index.md`. Idempotent (NFR-001): re-running against an already-in-sync
 * manifest writes byte-identical content — checked before writing so a
 * no-op sync never touches the file's mtime either.
 */
export function syncMarketplaceManifest(input: SyncMarketplaceManifestInput): MarketplaceManifest {
  const { knowledgeDir } = input;
  const fresh = renderMarketplaceManifest(input);
  const existing = readExistingManifest(knowledgeDir);
  const merged = mergeManifest(existing, fresh);
  const serialized = `${JSON.stringify(merged, null, 2)}\n`;
  const path = join(knowledgeDir, 'marketplace.json');
  const onDisk = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (onDisk !== serialized) writeFileSync(path, serialized, 'utf8');
  return merged;
}

export interface PublishCorpusInput extends RenderMarketplaceManifestInput {}

export interface PublishCorpusResult {
  /** Absolute path to the written `marketplace.json`. */
  manifestPath: string;
  /** Whether a manifest already existed at that path before this call. */
  alreadyExisted: boolean;
}

/**
 * The `corpus publish` door's primitive (FR-004): generate a missing
 * manifest, or refresh an existing one — the same `syncMarketplaceManifest`
 * either way, so "publish" and "the sync every write verb triggers" are one
 * mechanism, never two that could drift apart.
 */
export function publishCorpus(input: PublishCorpusInput): PublishCorpusResult {
  const path = join(input.knowledgeDir, 'marketplace.json');
  const alreadyExisted = existsSync(path);
  syncMarketplaceManifest(input);
  return { manifestPath: path, alreadyExisted };
}
