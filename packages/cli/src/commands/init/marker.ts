import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * The project-level profile marker (spec 041, D-005 / FR-009).
 *
 * `.spectastic/profile.json` records which profile is in effect so a re-run
 * can drive the additive Lean→Verified upgrade (FR-007) and downstream tooling
 * can read the project's ambition. `.spectastic/` is a namespaced home for
 * future spectastic state.
 */

export interface ProfileMarker {
  profile: string;
  schema: 1;
}

const MARKER_REL = join('.spectastic', 'profile.json');

export function markerPath(cwd: string): string {
  return join(cwd, MARKER_REL);
}

/** Read the marker, or null if none / unreadable (treated as "no prior profile"). */
export function readMarker(cwd: string): ProfileMarker | null {
  const path = markerPath(cwd);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<ProfileMarker>;
    if (typeof raw.profile === 'string' && raw.profile.length > 0) {
      return { profile: raw.profile, schema: 1 };
    }
    return null;
  } catch {
    return null;
  }
}

/** Write the marker (creating `.spectastic/`). Called after a successful install. */
export async function writeMarker(cwd: string, profile: string): Promise<void> {
  const path = markerPath(cwd);
  await mkdir(dirname(path), { recursive: true });
  const marker: ProfileMarker = { profile, schema: 1 };
  await writeFile(path, `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
}
