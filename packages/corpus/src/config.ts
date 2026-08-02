/**
 * The `corpus` config reader (063-corpus-discoverability, plan D-002/D-003).
 * Mirrors `config/models.ts`'s read-and-fail-fast shape: a top-level section
 * in the root `spectastic.json`, read synchronously, fail-fast on a
 * malformed value.
 *
 * Two layers, matching the models/decider precedent's own split between a
 * raw partial read and a resolved value: `loadCorpusConfig` returns exactly
 * what the file has (absent file/section → `{}`, so a caller can tell "set"
 * from "defaulted"); `resolveCorpusConfig` layers the defaults + the
 * deprecated `namespace` alias on top, so every consumer — `init`'s writer
 * (T-110) and the manifest sync's reader (T-210/T-211) — computes the exact
 * same value from the exact same function and can never silently disagree
 * (FR-006).
 *
 * `corpus.marketplace` is canonical; a present `corpus.namespace` (061's
 * interim key) is read as a deprecated alias ONLY when `marketplace` itself
 * is unset — never a second independent value (D-003).
 */

import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Finding } from '@spectastic/schema';
import { classifyProjectId } from '@spectastic/schema/project';
import { loadCorpus } from './knowledge/index.js';

export class CorpusConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorpusConfigError';
  }
}

/** The default corpus root directory, absent an explicit `corpus.root`. */
export const DEFAULT_CORPUS_ROOT = 'knowledge';

/** The default marketplace name, absent an explicit `corpus.marketplace` —
 * the repo directory name, the same value `init` already computes for
 * `projectName` (`init.ts`'s `basename(cwd)`). Exposed as a function (not a
 * constant) since it depends on `cwd`. */
export function defaultMarketplaceName(cwd: string): string {
  return basename(cwd);
}

/** The `corpus` file section, exactly as written — no defaults applied. */
export interface CorpusFileConfig {
  marketplace?: string;
  root?: string;
  /** Deprecated 061 alias for `marketplace` — read, never written by 063+. */
  namespace?: string;
}

/** The fully-resolved corpus config every consumer actually uses. */
export interface ResolvedCorpusConfig {
  marketplace: string;
  root: string;
}

/**
 * Read `<cwd>/spectastic.json` and extract the `corpus` section as a partial
 * config — exactly what's on disk, no defaults, no alias resolution. Absent
 * file/section → `{}`. Malformed JSON or a non-object/non-string field
 * throws loudly (a typo'd corpus config should fail the run, not silently
 * resolve to a surprising marketplace/root).
 */
export function loadCorpusConfig(cwd: string): CorpusFileConfig {
  let raw: string;
  try {
    raw = readFileSync(join(cwd, 'spectastic.json'), 'utf8');
  } catch {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (err) {
    throw new CorpusConfigError(`spectastic.json is not valid JSON — ${(err as Error).message}`);
  }

  const section = (parsed as { corpus?: unknown }).corpus;
  if (section === undefined || section === null) return {};
  if (typeof section !== 'object') {
    throw new CorpusConfigError('spectastic.json "corpus" must be an object');
  }

  const out: CorpusFileConfig = {};
  const marketplace = (section as { marketplace?: unknown }).marketplace;
  if (marketplace !== undefined) {
    if (typeof marketplace !== 'string' || marketplace.length === 0) {
      throw new CorpusConfigError('spectastic.json "corpus.marketplace" must be a non-empty string');
    }
    out.marketplace = marketplace;
  }

  const root = (section as { root?: unknown }).root;
  if (root !== undefined) {
    if (typeof root !== 'string' || root.length === 0) {
      throw new CorpusConfigError('spectastic.json "corpus.root" must be a non-empty string');
    }
    out.root = root;
  }

  const namespace = (section as { namespace?: unknown }).namespace;
  if (namespace !== undefined) {
    if (typeof namespace !== 'string' || namespace.length === 0) {
      throw new CorpusConfigError('spectastic.json "corpus.namespace" must be a non-empty string');
    }
    out.namespace = namespace;
  }

  return out;
}

/**
 * The resolved corpus config: `marketplace` (explicit `corpus.marketplace`,
 * else the deprecated `corpus.namespace` alias, else the top-level `project`
 * identity — 067-spec-project-identity FR-006, the unified-namespace tier —
 * else `basename(cwd)`) and `root` (explicit `corpus.root`, else
 * `DEFAULT_CORPUS_ROOT`). This is the single function every corpus-config
 * consumer calls — never re-derive the defaults independently (FR-006's
 * identity guarantee).
 */
export function resolveCorpusConfig(cwd: string): ResolvedCorpusConfig {
  const file = loadCorpusConfig(cwd);
  const project = loadProjectConfig(cwd);
  const marketplace = file.marketplace ?? file.namespace ?? project.project ?? defaultMarketplaceName(cwd);
  const root = file.root ?? DEFAULT_CORPUS_ROOT;
  return { marketplace, root };
}

/** The `project` file section, exactly as written — no default applied
 * (067-spec-project-identity FR-001). */
export interface ProjectFileConfig {
  project?: string;
}

/** The resolved project config every consumer (the `id` engine, the
 * unified-marketplace tier above, the validate finding below) reads through
 * — never re-derived from git or any other live source at read time
 * (FR-003, NFR-001). */
export interface ResolvedProjectConfig {
  project: string;
}

/**
 * Read `<cwd>/spectastic.json` and extract the top-level `project` field —
 * exactly what's on disk, no default. Absent file/field → `{}`. Mirrors
 * `loadCorpusConfig`'s shape exactly, including fail-fast on malformed JSON
 * or a non-string value.
 */
export function loadProjectConfig(cwd: string): ProjectFileConfig {
  let raw: string;
  try {
    raw = readFileSync(join(cwd, 'spectastic.json'), 'utf8');
  } catch {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (err) {
    throw new CorpusConfigError(`spectastic.json is not valid JSON — ${(err as Error).message}`);
  }

  const project = (parsed as { project?: unknown }).project;
  if (project === undefined) return {};
  if (typeof project !== 'string' || project.length === 0) {
    throw new CorpusConfigError('spectastic.json "project" must be a non-empty string');
  }
  return { project };
}

/**
 * The resolved project identity: the persisted `project` value, or
 * `basename(cwd)` — the provisional, not-yet-owner-qualified state (plan
 * D-002) — when absent. Pure: no git, no clock, no live environment read
 * (FR-003, NFR-001) — `init`'s `writeProjectConfig` is the ONLY place
 * derivation happens.
 */
export function resolveProjectConfig(cwd: string): ResolvedProjectConfig {
  const file = loadProjectConfig(cwd);
  const project = file.project ?? defaultMarketplaceName(cwd);
  return { project };
}

const PROJECT_IDENTITY_RULE = 'project-identity';

/**
 * The project-identity validate finding (067-spec-project-identity FR-007,
 * SC-005): a malformed `project` (illegal characters / wrong shape) is an
 * ERROR; a bare, unqualified default (no owner segment — the provisional
 * no-remote fallback) is a WARNING naming `spectastic init` as the fix; an
 * absent or well-formed owner-qualified `project` is silent. Wraps the
 * shared `classifyProjectId` predicate (`@spectastic/schema/project`) so
 * this finding and the `id` engine's own resolution can never disagree on
 * what "well-formed" means.
 */
export function projectIdentityFindings(cwd: string): Finding[] {
  const { project } = loadProjectConfig(cwd);
  if (project === undefined) return []; // single-repo back-compat (NFR-002) — no finding

  const shape = classifyProjectId(project);
  if (shape === 'owner-qualified') return [];

  const file = 'spectastic.json';
  if (shape === 'malformed') {
    return [
      {
        file,
        line: 1,
        column: 1,
        rule: PROJECT_IDENTITY_RULE,
        severity: 'error',
        message: `spectastic.json "project" ("${project}") is not a well-formed project identity — expected an owner-qualified <owner>/<repo> shape.`,
      },
    ];
  }
  // bare — collision-prone but not broken.
  return [
    {
      file,
      line: 1,
      column: 1,
      rule: PROJECT_IDENTITY_RULE,
      severity: 'warning',
      message: `spectastic.json "project" ("${project}") has no owner segment — a bare, collision-prone default. Run \`spectastic init\` again once a git remote is set to derive an owner-qualified identity, or set "project" by hand as <owner>/<repo>.`,
    },
  ];
}

const MARKETPLACE_IDENTITY_RULE = 'marketplace-identity';

/**
 * The marketplace-identity validate finding (078-federated-resource-uri
 * FR-011) — mirrors `projectIdentityFindings` one axis over, on the
 * RESOLVED marketplace (`resolveCorpusConfig`, not the raw file section):
 * a malformed marketplace is an ERROR; a bare, unqualified value — INCLUDING
 * the directory-name default, since a marketplace is never truly absent the
 * way `project` can be — is a WARNING naming the fix; a well-formed
 * owner-qualified marketplace is silent. Reuses the same `classifyProjectId`
 * shape predicate so this finding can never disagree with what
 * `corpusResourceUri`'s dedupe guarantee actually depends on.
 *
 * Unlike `projectIdentityFindings`, this scan is corpus-intrinsic — a
 * marketplace identity is a property of the corpus alone, with no
 * dependency on the lifecycle's `project` field existing — so it is also
 * wired into the standalone `spectastic-corpus validate` (078 D-006),
 * where `projectIdentityFindings` deliberately is not.
 *
 * Graceful absence (a real regression caught by T-401's own suite, not
 * anticipated by the design): unlike `project`, a marketplace ALWAYS
 * resolves to something (the directory-name default), so a naive version of
 * this scan fired on every project — including one with no corpus in use at
 * all, breaking the standalone binary's "no knowledge/, no findings"
 * guarantee (064 FR-007). The fix: fire only when there is actual evidence
 * the corpus is in use — an explicit `corpus.marketplace`/`corpus.namespace`
 * in the file, or at least one pack under `knowledge/`. Neither present
 * means nothing to warn about yet, so this stays silent exactly like its
 * corpus-intrinsic siblings (`corpusWellFormedFindings`, et al.).
 */
export function marketplaceIdentityFindings(cwd: string): Finding[] {
  const rawConfig = loadCorpusConfig(cwd);
  const explicitlyConfigured = rawConfig.marketplace !== undefined || rawConfig.namespace !== undefined;
  if (!explicitlyConfigured && loadCorpus(cwd).length === 0) return [];

  const { marketplace } = resolveCorpusConfig(cwd);
  const shape = classifyProjectId(marketplace);
  if (shape === 'owner-qualified') return [];

  const file = 'spectastic.json';
  if (shape === 'malformed') {
    return [
      {
        file,
        line: 1,
        column: 1,
        rule: MARKETPLACE_IDENTITY_RULE,
        severity: 'error',
        message: `The resolved corpus marketplace ("${marketplace}") is not a well-formed identity — expected an owner-qualified <owner>/<name> shape.`,
      },
    ];
  }
  // bare — collision-prone but not broken. Includes the directory-name
  // default: a marketplace always resolves to something, so there is no
  // "absent, therefore silent" branch the way project-identity has.
  return [
    {
      file,
      line: 1,
      column: 1,
      rule: MARKETPLACE_IDENTITY_RULE,
      severity: 'warning',
      message: `The resolved corpus marketplace ("${marketplace}") has no owner segment — a bare, collision-prone default. Set "corpus.marketplace" explicitly as <owner>/<name>, or qualify the project identity it derives from.`,
    },
  ];
}
