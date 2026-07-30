import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Init profile manifest loader (spec 041, D-001).
 *
 * Source of truth is repo-root `spectastic-profiles.json`, copied into the
 * bundle root by prebuild alongside `commands.json`. A missing/malformed
 * manifest yields an empty profile set — under which every name is "unknown" —
 * mirroring the fail-safe posture of `loadManifest` (manifest.ts).
 */

export interface Principle {
  name: string;
  statement: string;
}

// Enforcement primitives live in the core kernel (triage 042/T-001); imported
// for local use and re-exported so this module's consumers (compose.ts, …) keep
// importing them from './profiles.js'.
import type { EnforceGate, EnforcementCategory } from '@spectastic/core/enforce/types';

export type { EnforceGate, EnforcementCategory };

export interface EnforcePolicy {
  gate: EnforceGate;
  required: EnforcementCategory[];
  /** Categories a waiver cannot relax (spec 042, FR-012). Enterprise marks
   *  security + supply-chain un-relaxable; absent/empty means the whole floor
   *  is waivable. */
  unwaivable: EnforcementCategory[];
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

const NO_ENFORCE: EnforcePolicy = {
  gate: 'none',
  required: [],
  unwaivable: [],
};

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
        : `init: no profiles available (spectastic-profiles.json missing or malformed).`,
    );
  }
}

/** The manifest filename at the bundle root (namespaced; sibling of commands.json). */
const MANIFEST_FILE = 'spectastic-profiles.json';

/** Parse one raw profile entry into a validated Profile (fail-safe per field). */
function parseProfile(name: string, p: Partial<Profile> | undefined): Profile {
  const enforce = p?.enforce;
  const gateOk = enforce && ['none', 'soft', 'hard'].includes(enforce.gate);
  return {
    name,
    axes: p?.axes ?? {},
    enforce: gateOk
      ? {
          gate: enforce.gate,
          required: Array.isArray(enforce.required) ? enforce.required : [],
          unwaivable: Array.isArray(enforce.unwaivable) ? enforce.unwaivable : [],
        }
      : NO_ENFORCE,
    principles: Array.isArray(p?.principles) ? p.principles : [],
    agents: Array.isArray(p?.agents) ? p.agents : [],
  };
}

/** Load `spectastic-profiles.json` from a bundle root. Fail-safe to an empty manifest. */
export function loadProfiles(bundleRoot: string): ProfileManifest {
  const path = join(bundleRoot, MANIFEST_FILE);
  if (!existsSync(path)) return EMPTY;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<ProfileManifest>;
    const profiles: Record<string, Profile> = {};
    for (const [name, p] of Object.entries(raw.profiles ?? {})) {
      profiles[name] = parseProfile(name, p);
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
