import type { promises as fsPromises } from 'node:fs';
import { join } from 'node:path';

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

/**
 * The quarantine leg of the explore anti-ship guard (spec 022-explore, FR-006 /
 * D-003). The core verbs (spec/plan/tasks/propose/apply) MUST refuse to advance
 * an id that names a live quarantined exploration — graduation (deferred) is the
 * only bridge from `explorations/<id>/` into the spec lifecycle. This is the
 * second, defence-in-depth leg; the primary merge gate is `validate` erroring on
 * the marker (see commands/explore.ts `quarantineFinding`).
 *
 * Returns the quarantine reason when `explorations/<id>/quarantine.json` exists
 * with `status:"quarantined"`, else null (the verb proceeds). fs-injected and
 * side-effect-free so verbs can call it before doing any work.
 */
export async function gateOnQuarantine(
  fs: typeof fsPromises,
  cwd: string,
  specId: string,
): Promise<{ refused: true; message: string } | null> {
  const markerPath = join(cwd, 'explorations', specId, 'quarantine.json');
  let raw: string;
  try {
    raw = await fs.readFile(markerPath, 'utf8');
  } catch {
    return null;
  }
  let marker: { status?: string } = {};
  try {
    marker = JSON.parse(raw) as { status?: string };
  } catch {
    // A corrupt marker still signals a live exploration — refuse loudly.
    return {
      refused: true,
      message: `${markerPath} is unreadable but present — ${specId} is a quarantined exploration. Graduate or delete it before advancing.`,
    };
  }
  if (marker.status !== 'quarantined') return null;
  return {
    refused: true,
    message: `${specId} is a quarantined exploration (explorations/${specId}/). Core verbs refuse to advance it — graduate it into a spec, or delete it.`,
  };
}
