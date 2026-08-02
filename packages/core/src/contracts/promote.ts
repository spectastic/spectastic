/**
 * Contract promotion (spec 071-contract-promotion). A change that carries a
 * proposed contract — authored at specs/<id>/contracts/<name> per 070's
 * sidecar convention — has that contract become the effective one when the
 * change lands. Plan-then-execute (design D-003): planPromotion() reads but
 * never writes, so a conflict on the tenth contract aborts before the first
 * write (FR-004 atomicity); executePromotion() applies an already-conflict-
 * free plan.
 *
 * The comparison that matters is baseline-versus-current, never incoming-
 * versus-current (design's headline risk, T-100/T-300): the incoming content
 * is EXPECTED to differ from the current effective file — that is the whole
 * point of promoting. What must not have changed is the effective file
 * relative to what it looked like when the proposal's baseline was captured.
 */

import { basename, dirname } from 'node:path';
import type { FileSystem } from '../types.js';
import type { ContractChangeClass, ContractNotification } from './notify.js';
import { buildContractNotification } from './notify.js';
import type { PromotionArchive, PromotionConflict, PromotionPlan, PromotionWrite } from './types.js';

/**
 * Compute the full promotion plan for one change, read-only. Never touches
 * disk beyond reads. A non-empty `conflicts` clears `writes`/`archives` to
 * empty — FR-004's all-or-nothing guarantee.
 */
export async function planPromotion(specId: string, slug: string, fs: FileSystem, cwd: string): Promise<PromotionPlan> {
  const writes: PromotionWrite[] = [];
  const archives: PromotionArchive[] = [];
  const conflicts: PromotionConflict[] = [];

  const designPath = `${cwd}/specs/${specId}/design.html`;
  let designHtml: string;
  try {
    designHtml = await fs.readFile(designPath, 'utf8');
  } catch {
    return { writes, archives, conflicts }; // no design — nothing to promote
  }

  const { readContractDeclarations } = await import('@spectastic/schema/contract');
  const declarations = readContractDeclarations(designHtml, designPath);

  for (const decl of declarations) {
    if (decl.path === undefined) continue; // shape="none" or malformed — 070's resolve gate owns malformed paths

    const name = basename(decl.path);
    const proposedPath = `${cwd}/specs/${specId}/contracts/${name}`;
    const readOptional = async (path: string): Promise<string | undefined> => {
      try {
        return await fs.readFile(path, 'utf8');
      } catch {
        return undefined;
      }
    };

    const proposedContent = await readOptional(proposedPath);
    if (proposedContent === undefined) continue; // FR-006: no proposed contract for this declaration

    const effectivePath = `${cwd}/${decl.path}`;
    const baselinePath = `${cwd}/specs/${specId}/contracts/.baseline/${name}`;
    const effectiveContent = await readOptional(effectivePath);
    const baselineContent = await readOptional(baselinePath);

    if (baselineContent === undefined) {
      // D-005: no baseline recorded. Absence + no effective file = this
      // project's first contract for the interface — proceed. Absence + an
      // existing effective file = something else created it — refuse.
      if (effectiveContent !== undefined) {
        conflicts.push({
          path: decl.path,
          reason: `no baseline was recorded for ${decl.path}, but a file now exists there — refusing rather than overwriting an interface no proposal accounted for`,
        });
        continue;
      }
    } else if (effectiveContent !== baselineContent) {
      // The comparison that matters: baseline vs. CURRENT effective content —
      // never the incoming content, which differs by design on every promotion.
      conflicts.push({
        path: decl.path,
        reason: `the effective contract at ${decl.path} has changed since this proposal's baseline was recorded — refusing to overwrite`,
      });
      continue;
    }

    writes.push({ from: proposedPath, to: effectivePath });
    const archiveDir = `${cwd}/specs/${specId}/changes/archive/${slug}/contracts`;
    const archive: PromotionArchive = { from: proposedPath, to: `${archiveDir}/${name}` };
    if (baselineContent !== undefined) {
      archive.baselineFrom = baselinePath;
      archive.baselineTo = `${archiveDir}/.baseline/${name}`;
    }
    archives.push(archive);
  }

  if (conflicts.length > 0) {
    // FR-004: a conflict anywhere aborts the whole plan, not just its own entry.
    return { writes: [], archives: [], conflicts };
  }

  return { writes, archives, conflicts };
}

function assertNoConflicts(plan: PromotionPlan, caller: string): void {
  if (plan.conflicts.length > 0) {
    throw new Error(
      `${caller}: refusing to execute a plan carrying conflicts — ${plan.conflicts.map((c) => c.reason).join('; ')}`,
    );
  }
}

/**
 * Write phase only: land each proposed contract's content at its declared
 * effective path. Safe to run before a caller's own unrelated archive move —
 * it touches only effective-path destinations, never the changes/ tree.
 */
/**
 * Build the notifications a completed promotion owes its consumers (spec
 * 076-contract-export-handover, T-211 / FR-002). Derived from the plan the
 * kernel already computed, so emission cannot be skipped by a caller that
 * forgets a step — P-8: a mandatory side effect has a deterministic owner.
 *
 * Returns values; sends nothing. The tool composes the notification and hands
 * it back — delivery is the consuming project's mechanism to choose (FR-004),
 * which is what keeps this surface mechanism-agnostic and adds no capability.
 *
 * `project` absent (a repo with no declared identity) yields no notifications:
 * a coordinate needs an authority, and inventing one would mint a coordinate
 * that collides across the estate.
 */
export function promotionNotifications(
  plan: PromotionPlan,
  project: string | undefined,
  changeClass: ContractChangeClass = 'breaking',
): ContractNotification[] {
  if (project === undefined || project.trim() === '') return [];
  return plan.writes.map((w) => {
    const base = basename(w.to);
    const dot = base.lastIndexOf('.');
    const name = dot > 0 ? base.slice(0, dot) : base;
    return buildContractNotification({ project, name, changeClass });
  });
}

export async function executePromotionWrites(plan: PromotionPlan, fs: FileSystem): Promise<void> {
  assertNoConflicts(plan, 'executePromotionWrites');
  for (const w of plan.writes) {
    const content = await fs.readFile(w.from, 'utf8');
    // A project's first contract for an interface (D-005) has no existing
    // parent directory at its declared effective path — writeFile does not
    // create one (unlike mkdir, which is recursive), so ensure it first.
    await fs.mkdir(dirname(w.to));
    await fs.writeFile(w.to, content);
  }
}

/**
 * Archive phase only: move each proposed contract (and its baseline, if one
 * was recorded) into the applied change's archive folder.
 *
 * MUST run after any caller's own changes/<slug> → changes/archive/<slug>
 * move, not before: this phase's own `mkdir`+`rename` would otherwise create
 * changes/archive/<slug>/ as a side effect ahead of that outer rename, and a
 * real filesystem refuses to rename a directory onto an already-existing,
 * non-empty destination (ENOTEMPTY) — caught end-to-end against the real
 * binary (apply.contracts.integration.test.ts), invisible to the in-memory
 * stub unit tests above since a flat map has no such directory collision.
 */
export async function executePromotionArchives(plan: PromotionPlan, fs: FileSystem): Promise<void> {
  assertNoConflicts(plan, 'executePromotionArchives');
  for (const a of plan.archives) {
    await fs.mkdir(dirname(a.to));
    await fs.rename(a.from, a.to);
    if (a.baselineFrom && a.baselineTo) {
      await fs.mkdir(dirname(a.baselineTo));
      await fs.rename(a.baselineFrom, a.baselineTo);
    }
  }
}

/**
 * Apply an already-computed, conflict-free plan in one call: write phase
 * first, archive phase second — the same fail-safe ordering apply's own
 * archive step already documents (packages/core/src/commands/apply.ts:
 * 187-194), so a crash between the two leaves the proposal in place for a
 * clean retry rather than a half-promoted state.
 *
 * Convenience wrapper for callers with no colliding archive move of their
 * own (e.g. the unit tests above). The apply kernel does NOT use this
 * directly — it calls the two phases separately, interleaving its own
 * proposal-folder archive move between them; see executePromotionArchives.
 */
export async function executePromotion(plan: PromotionPlan, fs: FileSystem): Promise<void> {
  await executePromotionWrites(plan, fs);
  await executePromotionArchives(plan, fs);
}
