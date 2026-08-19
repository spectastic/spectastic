/**
 * The render run manifest (spec 106-visual-render, T-310, FR-009/FR-011,
 * SC-002).
 *
 * design.html D-006: "A manifest beside the captures, recording each
 * artboard as captured or not-captured-with-a-reason, and any console error
 * against its capture" — a file, not just an in-memory return value, so a
 * console error a run recorded is readable by anyone who opens the run's
 * own directory afterwards (FR-009's "MUST NOT be discarded").
 *
 * Deliberately decoupled from render-capture.ts's own `WrittenCapture` /
 * `RefusedCapture` shapes rather than importing them — this keeps the
 * dependency one-way (render-capture calls into here, never the reverse)
 * and keeps this module testable with plain data, the way P-14 asks a
 * core module to be.
 *
 * Re-run behaviour (FR-011, T-302): this module holds no state between
 * calls and reads nothing before writing — `buildManifest` always reflects
 * exactly the run just performed, never a merge with a previous one. FR-010
 * already forbids comparing a capture against anything, so there is
 * nothing here to guard.
 */

export type ManifestStatus = 'captured' | 'not-captured';

export interface ManifestCapturedEntry {
  label: string;
  status: 'captured';
  path: string;
  consoleErrors: string[];
}

export interface ManifestNotCapturedEntry {
  label: string;
  status: 'not-captured';
  reason: string;
}

export type ManifestEntry = ManifestCapturedEntry | ManifestNotCapturedEntry;

export interface RenderManifest {
  entries: ManifestEntry[];
}

/**
 * Every artboard the render found, as captured or not-captured-with-a-reason
 * (FR-011's accounting clause; SC-002's "captured plus not-captured equals
 * N"). Order is written-then-refused, not the original render order — the
 * two input arrays already carry each artboard's own order within its
 * bucket, and callers reading the manifest care about the bucket, not a
 * merged ordering neither FR-009 nor FR-011 asks for.
 */
export function buildManifest(
  written: ReadonlyArray<{ label: string; path: string; consoleErrors: string[] }>,
  refused: ReadonlyArray<{ label: string; reason: string }>,
): RenderManifest {
  const entries: ManifestEntry[] = [
    ...written.map(
      (w): ManifestCapturedEntry => ({ label: w.label, status: 'captured', path: w.path, consoleErrors: w.consoleErrors }),
    ),
    ...refused.map((r): ManifestNotCapturedEntry => ({ label: r.label, status: 'not-captured', reason: r.reason })),
  ];
  return { entries };
}

/** Stable, human-readable JSON — a manifest is meant to be opened and read,
 *  not only machine-parsed. */
export function serializeManifest(manifest: RenderManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
