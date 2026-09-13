import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Verb tier manifest. The init bundler installs the `core` verbs by default;
 * `extended` verbs install only when opted in via `init --with <verb>`.
 *
 * Source of truth is repo-root `commands.json`, copied into the bundle root
 * by prebuild (T-312). Per specs/018-explain/design.html D-002.
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
 * Extract the verb from an adapter destination path, for either host target:
 * the Claude command (`.claude/commands/spectastic.<verb>.md`) or the Codex
 * Agent-Skill (`.agents/skills/spectastic-<verb>/SKILL.md`, spec 111). Returns
 * null for any path that is not an adapter (assets, templates), so extended-verb
 * filtering in buildPlan works the same for both targets.
 */
export function verbFromDestination(relativeDestination: string): string | null {
  const claude = /(?:^|\/)\.claude\/commands\/spectastic\.([^/]+)\.md$/.exec(relativeDestination);
  if (claude) return claude[1] ?? null;
  const codex = /(?:^|\/)\.agents\/skills\/spectastic-([^/]+)\/SKILL\.md$/.exec(relativeDestination);
  return codex ? (codex[1] ?? null) : null;
}

/**
 * A verb is extended only if the manifest explicitly lists it as such.
 * Unlisted verbs default to core.
 */
export function isExtended(verb: string, manifest: VerbManifest): boolean {
  return manifest.extended.includes(verb);
}
