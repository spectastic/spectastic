/**
 * Bounded-concurrency map that preserves input order (spec 032-triage-fanout,
 * plan D-002). Replicates the two load-bearing semantics of p-map — results in
 * input order and a hard concurrency cap — WITHOUT adding a runtime dependency
 * to the published `@spectastic/core` package (p-map is only a dev/CI transitive
 * via @secretlint; promoting it would ship a new dep). Reference contract:
 * p-map@7 `index.d.ts` (fulfilled value is the mapper results in input order;
 * `concurrency` caps in-flight mappers).
 *
 * Correctness notes:
 *   - Results are written to `results[i]` by input index, so completion order
 *     never leaks into the output (spec FR-002).
 *   - At most `concurrency` workers pull from a shared cursor; the cursor
 *     read+increment is synchronous (no await between them), so no two workers
 *     ever claim the same index — JS's single-threaded model guarantees it.
 *   - The mapper SHOULD be total (never reject) when the caller needs failure
 *     isolation (spec FR-004): a rejecting mapper propagates and aborts the pool.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  mapper: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const cap = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      results[i] = await mapper(items[i]!, i);
    }
  }

  const workerCount = Math.min(cap, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
