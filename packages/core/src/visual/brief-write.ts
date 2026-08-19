/**
 * The dated write (spec 107-visual-design-brief, T-310, FR-009, design
 * D-001/D-002).
 *
 * A brief is written once and never rewritten. FR-009's own wording is
 * silent on a same-day re-run; refusing rather than silently overwriting an
 * existing file at the computed path is the same discipline
 * <106 FR-007> uses for a naming collision — recorded as a task-authoring-
 * time decision in tasks.html's own changelog, since the design left the
 * exact edge case open.
 */

import type { FileSystem } from '../types.js';

export interface BriefWriteInput {
  specId: string;
  /** ISO YYYY-MM-DD, supplied by the caller — the CLI is the only clock in
   *  this pipeline (D-003). */
  date: string;
  content: string;
}

export interface BriefWriteResult {
  /** Project-relative, matching the manifest's own convention (106's
   *  render-capture.ts) — a committed path must never carry the author's
   *  filesystem. */
  path: string;
}

export async function writeBrief(input: BriefWriteInput, fs: FileSystem, cwd: string): Promise<BriefWriteResult> {
  const relativePath = `specs/${input.specId}/visual/briefs/${input.date}.md`;
  const fullPath = `${cwd}/${relativePath}`;

  const exists = await fs
    .stat(fullPath)
    .then(() => true)
    .catch(() => false);
  if (exists) {
    throw new Error(`refusing to write "${relativePath}" — a brief already exists at this path and is never rewritten`);
  }

  await fs.mkdir(`${cwd}/specs/${input.specId}/visual/briefs`);
  await fs.writeFile(fullPath, input.content);
  return { path: relativePath };
}
