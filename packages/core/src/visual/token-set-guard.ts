/**
 * The token-set amendment guard (spec 098-token-set-versioning, FR-004).
 *
 * A compare-and-swap, cloned from the principles apply's stale guard: read the
 * live version out of the artifact, compare it for EQUALITY against what the
 * amendment declares it was written against, and refuse naming both values.
 *
 * It never asks which version is later, and must not learn to. NFR-001 caps
 * orderings at zero, because every versioning mechanism in this project
 * compares by equality and none orders — the corpus edition, the contract
 * baselines, the principles from-version. Equality is decidable without
 * agreeing a format contract; a mechanism claiming to know which version is
 * newer must then enforce that claim forever. A test asserts this module
 * contains no comparison rather than merely not calling one.
 *
 * Fails closed (NFR-002): a malformed or absent version on either side refuses
 * the amendment, so an unreadable artifact never lets a change through.
 */

const VERSION = /<spec-token-set\b[^>]*\bversion=["']([^"']*)["']/i;

/**
 * Throws unless the live artifact's version equals `declaredFrom`.
 *
 * Returns nothing on success — the caller proceeds. There is deliberately no
 * boolean variant: a guard that can be ignored is a suggestion.
 */
export function assertTokenSetVersion(liveHtml: string, declaredFrom: string | undefined): void {
  if (declaredFrom === undefined || declaredFrom.trim() === '') {
    throw new Error(
      'token-set amendment: no from-version declared. An amendment must state the version it was written against, so a stale change cannot land on top of one it never saw.',
    );
  }

  const liveVersion = VERSION.exec(liveHtml)?.[1]?.trim();

  if (liveVersion === undefined || liveVersion === '') {
    throw new Error(
      'token-set amendment: the live token set carries no readable version, so the amendment is refused. The guard fails closed — an unreadable version never lets a change through.',
    );
  }

  if (liveVersion !== declaredFrom.trim()) {
    throw new Error(
      `token-set amendment: stale — declares from-version ${declaredFrom.trim()} but the token set is at ${liveVersion}. Rebase the amendment onto the live version and re-declare it.`,
    );
  }
}
