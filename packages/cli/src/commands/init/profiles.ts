import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Init profile manifest loader (spec 041, D-001).
 *
 * Source of truth is repo-root `profiles.json`, copied into the bundle root by
 * prebuild alongside `commands.json`. A missing/malformed manifest yields an
 * empty profile set — under which every name is "unknown" — mirroring the
 * fail-safe posture of `loadManifest` (manifest.ts).
 */

export interface Principle {
  name: string;
  statement: string;
}

/** An enforcement category (spec 042). Detection + policy speak in these. */
export type EnforcementCategory =
  | 'formatter'
  | 'linter'
  | 'type-checker'
  | 'security'
  | 'supply-chain'
  | 'test-runner';

/** How hard the enforcement floor gates (spec 042, D-003). */
export type EnforceGate = 'none' | 'soft' | 'hard';

export interface EnforcePolicy {
  gate: EnforceGate;
  required: EnforcementCategory[];
}

export interface Profile {
  name: string;
  axes: Record<string, string>;
  /** Enforcement floor: required categories + gate severity (spec 042, FR-003). */
  enforce: EnforcePolicy;
  /** Extra principles this profile adds on top of the base set (deduped by name). */
  principles: Principle[];
  /** Profile-specific AGENTS.md lines appended under "Definition of done". */
  agents: string[];
}

const NO_ENFORCE: EnforcePolicy = { gate: 'none', required: [] };

export interface ProfileManifest {
  schema: number;
  base: { principles: Principle[]; agents: string[] };
  claudePointer: string[];
  profiles: Record<string, Profile>;
}

const EMPTY: ProfileManifest = {
  schema: 1,
  base: { principles: [], agents: [] },
  claudePointer: [],
  profiles: {},
};

export class UnknownProfileError extends Error {
  constructor(
    public readonly requested: string,
    public readonly valid: string[],
  ) {
    super(
      valid.length > 0
        ? `init: unknown profile "${requested}". Valid profiles: ${valid.join(', ')}.`
        : `init: no profiles available (profiles.json missing or malformed).`,
    );
  }
}

/** Load `profiles.json` from a bundle root. Fail-safe to an empty manifest. */
export function loadProfiles(bundleRoot: string): ProfileManifest {
  const path = join(bundleRoot, 'profiles.json');
  if (!existsSync(path)) return EMPTY;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<ProfileManifest>;
    const profiles: Record<string, Profile> = {};
    for (const [name, p] of Object.entries(raw.profiles ?? {})) {
      const enforce = p?.enforce;
      profiles[name] = {
        name,
        axes: p?.axes ?? {},
        enforce:
          enforce && (enforce.gate === 'soft' || enforce.gate === 'hard' || enforce.gate === 'none')
            ? { gate: enforce.gate, required: Array.isArray(enforce.required) ? enforce.required : [] }
            : NO_ENFORCE,
        principles: Array.isArray(p?.principles) ? p.principles : [],
        agents: Array.isArray(p?.agents) ? p.agents : [],
      };
    }
    return {
      schema: typeof raw.schema === 'number' ? raw.schema : 1,
      base: {
        principles: Array.isArray(raw.base?.principles) ? raw.base.principles : [],
        agents: Array.isArray(raw.base?.agents) ? raw.base.agents : [],
      },
      claudePointer: Array.isArray(raw.claudePointer) ? raw.claudePointer : [],
      profiles,
    };
  } catch {
    return EMPTY;
  }
}

/** The valid profile names, in manifest order. */
export function profileNames(manifest: ProfileManifest): string[] {
  return Object.keys(manifest.profiles);
}

/** Resolve a profile by name, or throw UnknownProfileError listing the valid ones. */
export function resolveProfile(manifest: ProfileManifest, name: string): Profile {
  const profile = manifest.profiles[name];
  if (!profile) throw new UnknownProfileError(name, profileNames(manifest));
  return profile;
}
