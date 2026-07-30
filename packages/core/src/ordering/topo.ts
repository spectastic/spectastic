/**
 * The ordering algorithm (spec 028-dependency-ordering): Kahn's topological
 * sort with a value-priority ready-queue (FR-002), foundation elevation by
 * summed unblocked-subtree value (FR-004), deterministic spec-id tie-break
 * (NFR-001), and a hard cycle error that names the loop (FR-005). Pure and
 * O(V+E) — no IO, no clock.
 */

import type { Edge, OrderTag, RankedNode, ScoredNode } from './types.js';
import { CycleError } from './types.js';

/** Deterministic ascending spec-id comparison. */
function byId(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

interface Adjacency {
  ids: string[];
  out: Map<string, string[]>;
  indeg: Map<string, number>;
}

/** Build adjacency lists, ignoring edges that reference an unknown node. */
function adjacency(nodes: readonly ScoredNode[], edges: readonly Edge[]): Adjacency {
  const ids = nodes.map((n) => n.specId);
  const idSet = new Set(ids);
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const e of edges) {
    if (!idSet.has(e.from) || !idSet.has(e.to)) continue;
    out.get(e.from)?.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  return { ids, out, indeg };
}

/** Every node transitively reachable from `id` (its unblocked subtree), deduped, excluding self. */
function descendants(id: string, out: ReadonlyMap<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const stack = [...(out.get(id) ?? [])];
  while (stack.length > 0) {
    const x = stack.pop();
    if (x === undefined || seen.has(x)) continue;
    seen.add(x);
    for (const y of out.get(x) ?? []) stack.push(y);
  }
  return seen;
}

/** Summed value of each node's unblocked subtree (FR-004), deduped by id (plan R-4). */
function subtreeValues(
  ids: readonly string[],
  out: ReadonlyMap<string, string[]>,
  valueMap: ReadonlyMap<string, number | null>,
): Map<string, number> {
  const sub = new Map<string, number>();
  for (const id of ids) {
    let s = 0;
    for (const d of descendants(id, out)) s += valueMap.get(d) ?? 0;
    sub.set(id, s);
  }
  return sub;
}

/** Find one actual cycle among the residual (never-ready) nodes, for the error message. */
function findCycle(residual: readonly string[], out: ReadonlyMap<string, string[]>): string[] {
  const inResidual = new Set(residual);
  const state = new Map<string, 1 | 2>(); // 1 = on stack, 2 = done
  const stack: string[] = [];
  let cycle: string[] | null = null;

  const dfs = (u: string): boolean => {
    state.set(u, 1);
    stack.push(u);
    for (const v of out.get(u) ?? []) {
      if (!inResidual.has(v)) continue;
      if (!state.has(v)) {
        if (dfs(v)) return true;
      } else if (state.get(v) === 1) {
        cycle = stack.slice(stack.indexOf(v));
        return true;
      }
    }
    state.set(u, 2);
    stack.pop();
    return false;
  };

  for (const r of residual) {
    if (!state.has(r) && dfs(r)) break;
  }
  return cycle ?? [...residual];
}

/** The order tag for a node given its value and subtree leverage. */
function tagFor(value: number | null, subtreeValue: number): OrderTag {
  if (value === null) return 'unranked';
  if (subtreeValue > 0) return 'elevated';
  return 'ranked';
}

/**
 * Emit the dependency-respecting, value-ranked order. Among nodes whose
 * dependencies are all placed, the highest-priority one goes next; priority is
 * `(value ?? 0) + subtreeValue`, ties broken by spec id ascending. Throws
 * {@link CycleError} if any node never becomes ready.
 */
export function topoOrder(nodes: readonly ScoredNode[], edges: readonly Edge[]): RankedNode[] {
  const { ids, out, indeg } = adjacency(nodes, edges);
  const nodeOf = new Map(nodes.map((n) => [n.specId, n]));
  const valueMap = new Map(nodes.map((n) => [n.specId, n.value]));
  const subtree = subtreeValues(ids, out, valueMap);
  const priority = (id: string): number => (valueMap.get(id) ?? 0) + (subtree.get(id) ?? 0);

  // Stable, priority-ordered ready set: highest priority first, then spec id asc.
  const ready = ids.filter((id) => indeg.get(id) === 0);
  const order: string[] = [];
  const emitted = new Set<string>();
  while (ready.length > 0) {
    ready.sort((a, b) => priority(b) - priority(a) || byId(a, b));
    const id = ready.shift();
    if (id === undefined) break;
    order.push(id);
    emitted.add(id);
    for (const to of out.get(id) ?? []) {
      const next = (indeg.get(to) ?? 0) - 1;
      indeg.set(to, next);
      if (next === 0) ready.push(to);
    }
  }

  if (order.length !== ids.length) {
    const residual = ids.filter((id) => !emitted.has(id));
    throw new CycleError(findCycle(residual, out));
  }

  const parentsOf = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const [from, tos] of out) for (const to of tos) parentsOf.get(to)?.push(from);

  const ranked: RankedNode[] = [];
  order.forEach((id, i) => {
    const node = nodeOf.get(id);
    if (!node) return;
    const subtreeValue = subtree.get(id) ?? 0;
    ranked.push({
      ...node,
      rank: i + 1,
      tag: tagFor(node.value, subtreeValue),
      subtreeValue,
      priority: priority(id),
      dependsOn: parentsOf.get(id) ?? [],
      unblocks: out.get(id) ?? [],
      wsjf: null, // populated by the WSJF cross-check (render layer, FR-008)
      diverges: false,
    });
  });
  return ranked;
}
