/**
 * Contract-change notification (spec 076-contract-export-handover, US2/US3).
 *
 * When a promotion lands a contract, consumers pinned to its coordinate need to
 * learn that the shape they depend on moved. This builds that notification —
 * a value, not a delivery: the tool composes and returns it, and never fetches,
 * posts, or spawns anything (FR-004 — the export surface is mechanism-agnostic,
 * so a vendoring recipe and a published-artifact recipe consume the identical
 * notification with no change to any guarantee here).
 *
 * The change class is the PRODUCER'S CLAIM, exactly as 077's compatibility
 * stance is: semantic breakage is invisible to structural analysis and the
 * consumer set is not enumerable, so the copy says "claims", never "is".
 */

import { contractResourceUri } from '@spectastic/schema/project';
import { parseConfigText } from '@spectastic/schema/config';

/**
 * How a contract changed. Deliberately a two-value floor rather than an open
 * enum (FR-003): every consumer must handle breaking-versus-not, and nothing
 * more is required of them.
 *
 * A WITHDRAWAL is modelled as a SUBTYPE of breaking (D-003), not a third kind:
 * a consumer branching only on breaking-versus-non-breaking still handles a
 * withdrawal correctly, because a withdrawal is unambiguously breaking — while
 * a consumer that cares can read `withdrawnReason` and know there is no
 * successor shape to migrate to. Modelling it as a sibling kind would have made
 * every consumer gain a state to handle for a case most do not distinguish.
 */
export type ContractChangeClass = 'breaking' | 'non-breaking';

export interface ContractNotification {
  /** The federation-unique coordinate the change is about (FR-001). */
  coordinate: string;
  /** The producer's CLAIM about the change's class — never a verified property. */
  changeClass: ContractChangeClass;
  /**
   * Present only for a withdrawal: why the contract was withdrawn, and the
   * signal that there is no successor shape. A withdrawal always carries
   * `changeClass: 'breaking'` (D-003).
   */
  withdrawnReason?: string;
  /** Human-readable one-liner, phrased as a claim rather than a fact. */
  summary: string;
}

export interface BuildNotificationInput {
  /** The producing project's identity — the coordinate's authority. */
  project: string;
  /** The contract's stable coordinate name (076 D-002) — never its path. */
  name: string;
  changeClass: ContractChangeClass;
  /** Set to mark this a withdrawal; implies a breaking class (D-003). */
  withdrawnReason?: string;
}

/**
 * Compose the notification for one promoted contract change. Pure: no fs, no
 * clock, no network (FR-004/NFR-001) — identical input, identical output.
 */
export function buildContractNotification(input: BuildNotificationInput): ContractNotification {
  const coordinate = contractResourceUri(input.project, input.name);
  const isWithdrawal = input.withdrawnReason !== undefined && input.withdrawnReason.trim() !== '';
  // A withdrawal is unambiguously breaking — the class is not the caller's to
  // soften, so it is normalised here rather than trusted (D-003).
  const changeClass: ContractChangeClass = isWithdrawal ? 'breaking' : input.changeClass;

  const summary = isWithdrawal
    ? `${coordinate} was withdrawn — the producer claims a breaking change with no successor shape: ${input.withdrawnReason!.trim()}`
    : `${coordinate} changed — the producer claims a ${changeClass} change.`;

  return {
    coordinate,
    changeClass,
    ...(isWithdrawal ? { withdrawnReason: input.withdrawnReason!.trim() } : {}),
    summary,
  };
}

/**
 * Which of a project's declared dependencies a notification concerns (FR-005).
 *
 * Matching is on the coordinate, exactly — a notification for one contract must
 * never be routed to a consumer of another. `consumes` is absent by default
 * (D-004), and a project that declares nothing simply matches nothing: a
 * monorepo where producer and consumer coexist needs no entry at all and incurs
 * no additional step (NFR-002).
 */
export function notificationMatchesConsumer(
  notification: ContractNotification,
  consumes: readonly string[] | undefined,
): boolean {
  if (consumes === undefined || consumes.length === 0) return false;
  return consumes.includes(notification.coordinate);
}

/** Route one notification to the subset of consumers that declared its coordinate. */
export function routeNotification<T extends { consumes?: readonly string[] }>(
  notification: ContractNotification,
  consumers: readonly T[],
): T[] {
  return consumers.filter((c) => notificationMatchesConsumer(notification, c.consumes));
}

/**
 * Read a project's declared `consumes` coordinates from `spectastic.json`
 * (076 D-004). ABSENT BY DEFAULT — a project that declares nothing gets `[]`,
 * which matches nothing and costs nothing: a monorepo where producer and
 * consumer coexist needs no entry at all (NFR-002).
 *
 * Fails soft in every direction — no file, unreadable, malformed JSON, or a
 * `consumes` that is not an array of strings all degrade to `[]` rather than
 * throwing. A hand-edited config must never crash a notification route.
 */
export function readConsumes(cwd: string, readFile: (path: string) => string): readonly string[] {
  let raw: string;
  try {
    raw = readFile(`${cwd}/spectastic.json`);
  } catch {
    return [];
  }
  try {
    // Parsed through the canonical module (086 FR-004); the IO stays on the
    // injected port, which is the seam this module is built on.
    const parsed: unknown = parseConfigText(raw);
    if (typeof parsed !== 'object' || parsed === null) return [];
    const consumes = (parsed as { consumes?: unknown }).consumes;
    if (!Array.isArray(consumes)) return [];
    return consumes.filter((c): c is string => typeof c === 'string' && c.trim() !== '');
  } catch {
    return [];
  }
}
