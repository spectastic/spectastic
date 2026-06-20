import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Verb tier manifest. The init bundler installs the `core` verbs by default;
 * `extended` verbs install only when opted in via `init --with <verb>`.
 *
 * Source of truth is repo-root `commands.json`, copied into the bundle root
 * by prebuild (T-312). Per specs/018-explain/plan.html D-002.
 */
export interface VerbManifest {
  core: string[];
  extended: string[];
}

const EMPTY: VerbManifest = { core: [], extended: [] };

/**
 * Load `commands.json` from a bundle root. A missing or malformed manifest
 * yields the empty manifest — under which `isExtended` is false for every
 * verb, so nothing is filtered (fail-safe: a verb installs unless explicitly
 * marked extended).
 */
export function loadManifest(bundleRoot: string): VerbManifest {
  const path = join(bundleRoot, 'commands.json');
  if (!existsSync(path)) return EMPTY;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<VerbManifest>;
    return {
      core: Array.isArray(raw.core) ? raw.core : [],
      extended: Array.isArray(raw.extended) ? raw.extended : [],
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Extract the verb from a command destination path
 * (`.claude/commands/spectastic.<verb>.md`). Returns null for any path that
 * is not a spectastic command file (assets, templates).
 */
export function verbFromDestination(relativeDestination: string): string | null {
  const m = /(?:^|\/)\.claude\/commands\/spectastic\.([^/]+)\.md$/.exec(relativeDestination);
  return m ? (m[1] ?? null) : null;
}

/**
 * A verb is extended only if the manifest explicitly lists it as such.
 * Unlisted verbs default to core.
 */
export function isExtended(verb: string, manifest: VerbManifest): boolean {
  return manifest.extended.includes(verb);
}
