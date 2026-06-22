/**
 * Staleness by file mtime (spec FR-007, plan D-006). Pure and vscode-free so it
 * runs under the vitest glob. A node is stale when any artifact earlier in the
 * lifecycle order was modified more recently than it.
 */
export interface MtimeItem {
  id: string;
  /** Position in the canonical verb order (lower = upstream). */
  orderIndex: number;
  mtimeMs: number;
}

export function flagStale(items: readonly MtimeItem[]): Set<string> {
  const stale = new Set<string>();
  for (const item of items) {
    const staleAgainstUpstream = items.some(
      (other) => other.orderIndex < item.orderIndex && other.mtimeMs > item.mtimeMs,
    );
    if (staleAgainstUpstream) stale.add(item.id);
  }
  return stale;
}
