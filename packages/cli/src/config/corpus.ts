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

import { basename, join } from 'node:path';
import { readFileSync } from 'node:fs';

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
 * else the deprecated `corpus.namespace` alias, else `basename(cwd)`) and
 * `root` (explicit `corpus.root`, else `DEFAULT_CORPUS_ROOT`). This is the
 * single function every corpus-config consumer calls — never re-derive the
 * defaults independently (FR-006's identity guarantee).
 */
export function resolveCorpusConfig(cwd: string): ResolvedCorpusConfig {
  const file = loadCorpusConfig(cwd);
  const marketplace = file.marketplace ?? file.namespace ?? defaultMarketplaceName(cwd);
  const root = file.root ?? DEFAULT_CORPUS_ROOT;
  return { marketplace, root };
}
