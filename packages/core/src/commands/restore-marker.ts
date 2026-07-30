/**
 * Read the frozen classification from a graduated exploration's archived marker
 * (spec 024-explore-restore, FR-004 / D-003).
 *
 * Graduation (spec 023) writes `{ status: 'graduated', classify, … }` to
 * `explorations/archive/<id>/quarantine.json` and freezes it; restore reads that
 * `classify` to pick the path — it never re-asks. Returns `null` when the id is
 * not a graduated exploration (no archived marker, unreadable, or a marker that
 * has not flipped to `graduated`), which the CLI treats as "nothing to restore".
 *
 * This is the archive-side sibling of `gateOnQuarantine`, which reads the LIVE
 * marker at `explorations/<id>/`. They are different lifecycle states of the same
 * id — a live marker means "still quarantined, refuse"; an archived one means
 * "graduated, here is the immutable classification" (plan §9).
 */

import type { FileSystem, GraduationClass } from '../types.js';

export async function readArchivedClassify(fs: FileSystem, cwd: string, id: string): Promise<GraduationClass | null> {
  const markerPath = `${cwd}/explorations/archive/${id}/quarantine.json`;
  let raw: string;
  try {
    raw = await fs.readFile(markerPath, 'utf8');
  } catch {
    return null;
  }
  try {
    const marker = JSON.parse(raw) as {
      status?: string;
      classify?: GraduationClass;
    };
    if (marker.status !== 'graduated') return null;
    return marker.classify ?? null;
  } catch {
    return null;
  }
}
