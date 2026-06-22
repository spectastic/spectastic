import type { promises as fsPromises } from 'node:fs';

/**
 * Gate authoring-verb writes on the destination's `<spec-status>` per
 * P-6 of principles.html: Draft destinations accept in-place edit;
 * past-Draft destinations refuse (with a pointer to the change-management
 * surface). `--force` bypasses the past-Draft refuse with a warning.
 */
export type GateDecision =
  | { kind: 'write-fresh' }
  | { kind: 'edit-in-place'; existing: string; status: string | null }
  | { kind: 'refuse'; status: string; existing: string };

export async function gateOnDestinationState(
  fs: typeof fsPromises,
  destPath: string,
  opts: { force?: boolean | undefined },
): Promise<GateDecision> {
  let existing: string;
  try {
    existing = await fs.readFile(destPath, 'utf8');
  } catch {
    return { kind: 'write-fresh' };
  }

  const { extractSpecStatus } = await import('@spectastic/schema');
  const status = extractSpecStatus(existing);

  if (status === null || status === 'draft') {
    return { kind: 'edit-in-place', existing, status };
  }

  if (opts.force) {
    return { kind: 'edit-in-place', existing, status };
  }

  return { kind: 'refuse', status, existing };
}
