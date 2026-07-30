/**
 * Origin-aware spec-id allocation for the git layer (spec 026-git-strategy,
 * FR-006 / plan D-004). The branch is the reservation: when `spec` opens a new
 * slice under `branch+commit`, allocate `NNN` from the union of the local
 * `specs/` scan and `origin/<default>`'s `specs/` tree (after a time-boxed
 * fetch), so two branches rarely grab the same number. No remote, or a fetch
 * that times out, falls back to the local scan — and the shipped 025
 * `spec-id-unique` CI gate remains the net for the residual race.
 *
 * The local scan mirrors explore's `resolveNextId` (it scans both `specs/` and
 * `explorations/` so graduation can reuse the id).
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { GitRunner } from './run.js';

const ID_PREFIX = /^(\d{3})-/;

/** Highest `NNN` among directory names like `024-foo`, or 0 if none. */
export function highestNumberInDirs(names: string[]): number {
  let max = 0;
  for (const name of names) {
    const m = ID_PREFIX.exec(name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

async function dirNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** The highest `NNN` across local `specs/` and `explorations/`. */
export async function highestLocalSpecNumber(cwd: string): Promise<number> {
  const [specs, explorations] = await Promise.all([dirNames(join(cwd, 'specs')), dirNames(join(cwd, 'explorations'))]);
  return Math.max(highestNumberInDirs(specs), highestNumberInDirs(explorations));
}

/** Minimal slugify — lowercased, non-alphanumerics to single dashes, trimmed. */
export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'untitled'
  );
}

export interface AllocateOpts {
  /** A git runner enables the origin-aware path; omitted → local scan only. */
  runner?: GitRunner;
  /** Fetch timeout in ms (default 3000). On timeout/no-remote → local fallback. */
  fetchTimeoutMs?: number;
}

/**
 * Resolve the next `NNN-slug` spec id. Allocates against local ∪ origin when a
 * runner is supplied and the remote is reachable; otherwise local only.
 */
export async function resolveNextSpecId(cwd: string, slug: string, opts: AllocateOpts = {}): Promise<string> {
  const local = await highestLocalSpecNumber(cwd);

  let originMax = 0;
  if (opts.runner) {
    const def = await opts.runner.defaultBranch();
    if (def) {
      const fetched = await opts.runner.fetchDefault(def, opts.fetchTimeoutMs ?? 3000);
      if (fetched) {
        const dirs = await opts.runner.lsTreeSpecDirs(`origin/${def}`);
        originMax = highestNumberInDirs(dirs);
      }
    }
  }

  const next = Math.max(local, originMax) + 1;
  return `${String(next).padStart(3, '0')}-${slugify(slug)}`;
}
