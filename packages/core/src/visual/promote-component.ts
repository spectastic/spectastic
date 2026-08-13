/**
 * Component promotion (spec 097-visual-component-lifecycle, FR-002/FR-003/FR-004).
 *
 * A deliberate clone of the contract promotion, because FR-003 asks for the
 * same three properties and that module already holds them: plan-then-execute,
 * so a conflict on the tenth declaration aborts before the first write; and a
 * refusal when the destination has changed since the proposal recorded it.
 *
 * The comparison that matters is BASELINE-versus-current, never
 * incoming-versus-current. The incoming component is *expected* to differ from
 * what is at the destination — that is the whole point of promoting. What must
 * not have moved is the destination relative to what the proposal saw.
 *
 * Two things this module deliberately does NOT do:
 *
 *  - It detects no reuse and initiates nothing. Promotion is human-initiated
 *    through a proposal (FR-002), because promoting on detected reuse converts
 *    a weak signal — two things that resemble each other — into a
 *    strong-looking one, which is the refusal this project has already made
 *    about inferred relationships. A test asserts the absence.
 *  - It does not assume promotion means moving a file. A `consumed` component
 *    has no file in the project at all, so its promotion declares shared use
 *    and relocates nothing (FR-010). Every other origin does involve a file,
 *    which is exactly why this case is the one an implementation breaks on.
 */

import type { FileSystem } from '../types.js';

export interface ComponentPromotionProposal {
  /** The component's name. */
  component: string;
  /** The feature-scoped file, or `undefined` for a consumed component. */
  from: string | undefined;
  /** The project-scoped destination, or `undefined` for a consumed component. */
  to: string | undefined;
  /** What the destination looked like when the proposal was recorded. */
  baseline: string | undefined;
  /** Files carrying declarations that reference this component. */
  referringFiles: readonly string[];
}

export interface ComponentPromotionWrite {
  from: string;
  to: string;
}

export interface ComponentPromotionConflict {
  path: string;
  reason: string;
}

export interface ComponentPromotionPlan {
  component: string;
  /** File moves. Empty for a consumed component, and empty on any conflict. */
  writes: ComponentPromotionWrite[];
  /** Declarations that must be updated so none points at a location the
   *  component has left (FR-004). */
  declarationUpdates: string[];
  /** Non-empty means `writes` and `declarationUpdates` are cleared — the
   *  atomicity guarantee, expressed the same way the contract plan expresses it. */
  conflicts: ComponentPromotionConflict[];
}

export interface ComponentPromotionResult {
  moved: number;
  declarationsToUpdate: string[];
}

/**
 * Plan a promotion. Reads, and never writes.
 */
export async function planComponentPromotion(
  proposal: ComponentPromotionProposal,
  fs: FileSystem,
  _cwd: string,
): Promise<ComponentPromotionPlan> {
  const conflicts: ComponentPromotionConflict[] = [];
  const writes: ComponentPromotionWrite[] = [];
  const declarationUpdates = [...proposal.referringFiles];

  // A consumed component has no file here. Promoting it means declaring shared
  // use, which is a declaration update and nothing else.
  if (proposal.from !== undefined && proposal.to !== undefined) {
    let current: string | undefined;
    try {
      current = await fs.readFile(proposal.to, 'utf8');
    } catch {
      current = undefined;
    }

    if (current !== undefined && current !== proposal.baseline) {
      conflicts.push({
        path: proposal.to,
        reason:
          proposal.baseline === undefined
            ? 'the destination already holds a component the proposal did not record'
            : 'the destination changed since the proposal recorded its baseline',
      });
    } else {
      writes.push({ from: proposal.from, to: proposal.to });
    }
  }

  // Atomicity: a conflict anywhere clears everything, so a partial promotion
  // cannot leave declarations pointing at a location the component has left.
  if (conflicts.length > 0) {
    return { component: proposal.component, writes: [], declarationUpdates: [], conflicts };
  }

  return { component: proposal.component, writes, declarationUpdates, conflicts };
}

/**
 * Apply an already-conflict-free plan. A conflicted plan carries no writes, so
 * executing one is a no-op rather than a special case.
 */
export async function executeComponentPromotion(
  plan: ComponentPromotionPlan,
  fs: FileSystem,
  _cwd: string,
): Promise<ComponentPromotionResult> {
  for (const write of plan.writes) {
    await fs.rename(write.from, write.to);
  }
  return { moved: plan.writes.length, declarationsToUpdate: [...plan.declarationUpdates] };
}
