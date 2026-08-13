/**
 * The design-source seam (spec 105-design-source-import, design D-001).
 *
 * One method, resolving a source location to a directory on disk. For a local
 * export that is very nearly the identity function, and the seam is still
 * worth having for the reason the corpus fetcher records: it is what keeps the
 * import door away from a real filesystem layout the tests do not control, and
 * it makes a future source with a different resolution story a new
 * implementation rather than a change to the importer.
 *
 * There is deliberately no live protocol implementation. Three of the five
 * design sources expose one and two have nothing persistent to query; using a
 * live path would make a spec only as available as somebody's seat.
 */

export interface DesignSourceFetcher {
  /** Resolve a source location to a local directory. Throws if it cannot. */
  fetch(location: string): Promise<string>;
}
