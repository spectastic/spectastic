/**
 * Types for the dependency-respecting value ordering (spec
 * 028-dependency-ordering). The graph is inferred from the corpus, never
 * authored: an edge is a *reciprocated* defer-to ↔ spec-parent pair, directed
 * parent → child (plan D-001). RICE supplies the value (FR-003); a cycle is an
 * error, not a state (FR-005).
 */

import type { RiceInputs } from '@spectastic/schema';

/** One spec a node in the graph: its id, title, status, and RICE inputs (or null = unranked). */
export interface SpecNode {
  specId: string;
  title: string;
  /** The spec's `<spec-status>` value, or null. Used to flag superseded foundations. */
  status: string | null;
  /** Authored RICE inputs, or null when the spec carries no (or a malformed) `<spec-rice>`. */
  rice: RiceInputs | null;
}

/** A precedence edge: `from` must precede `to` (parent precedes child). */
export interface Edge {
  from: string;
  to: string;
}

/** A defer-to / spec-parent reference whose target isn't in the corpus (FR-010). */
export interface DanglingRef {
  /** The spec that carries the reference. */
  from: string;
  /** The missing target spec id. */
  ref: string;
  kind: 'defer-to' | 'spec-parent';
}

/** A scored node — RICE value resolved (null ⇒ unranked). */
export interface ScoredNode extends SpecNode {
  /** `reach × impact × confidence ÷ effort`, or null when unranked. */
  value: number | null;
}

/** How a node sits in the emitted order. */
export type OrderTag = 'ranked' | 'unranked' | 'elevated';

/** One node placed in the order, with its value/elevation/WSJF facets. */
export interface RankedNode extends ScoredNode {
  /** 1-based position in the emitted order. */
  rank: number;
  tag: OrderTag;
  /** Summed value of every spec this node transitively unblocks (deduped). */
  subtreeValue: number;
  /** Priority used to order ready peers: `(value ?? 0) + subtreeValue`. */
  priority: number;
  /** The specs that must precede this one (its parents). */
  dependsOn: string[];
  /** The specs this one directly unblocks (its children). */
  unblocks: string[];
  /** WSJF cross-check score (FR-008), or null when unranked. */
  wsjf: number | null;
  /** True when this spec's RICE rank differs from its WSJF rank — a leverage signal. */
  diverges: boolean;
}

/** The full ordering model — the single derivation two renderers project (plan §4). */
export interface Ordering {
  /** Nodes in emitted (dependency-respecting, value-ranked) order. */
  entries: RankedNode[];
  /** References whose target wasn't in the corpus. */
  dangling: DanglingRef[];
}

/** A spec read off disk: its id (directory name) and raw HTML. */
export interface CorpusEntry {
  specId: string;
  html: string;
}

/** Thrown when the inferred graph contains a precedence cycle (FR-005). */
export class CycleError extends Error {
  /** The specs forming the cycle, in order (the first is also the closing node). */
  readonly cycle: string[];
  constructor(cycle: string[]) {
    const loop = cycle.length > 0 ? `${cycle.join(' → ')} → ${cycle[0]}` : '(unknown)';
    super(`precedence cycle — no order emitted; break one of these links: ${loop}`);
    this.name = 'CycleError';
    this.cycle = cycle;
  }
}
