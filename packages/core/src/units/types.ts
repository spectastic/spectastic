/**
 * Unit-dependency-edge primitives (spec 079-unit-dependency-edge).
 *
 * A *unit* is anything that can depend on another thing — a module inside a
 * repository, or a whole project — and both are named by the same coordinate
 * grammar (FR-001). An *edge* is one directed `depends-on` relation between
 * two units (FR-002).
 *
 * Kept deliberately small: only the fields the landed FRs need. The contract is
 * cheap to widen now and expensive later, which is the same posture the corpus
 * types take.
 */

/** How an edge came to be known. A declaration outranks an inference (FR-007). */
export type EdgeOrigin = 'declared' | 'inferred';

/**
 * What reading the far end established (FR-004 / FR-005). Three-valued rather
 * than boolean, because "could not read it" is a distinct answer from "read it
 * and it does not agree" — the whole reason `unverified` exists as a mark.
 */
export type FarEndVerdict = 'agrees' | 'silent' | 'unreadable';

/**
 * The two marks an edge carries, derived at read time and never authored
 * (spec §4). They are independent and answer different questions:
 *
 *   verified      — the far end was read at all
 *   reciprocated  — the far end, having been read, names this unit back
 *
 * So an unverified edge can never be reciprocated, while a verified one may or
 * may not be. Three reachable states, which is exactly what a reader needs to
 * weigh a relationship.
 */
export interface EdgeMarks {
  verified: boolean;
  reciprocated: boolean;
}

/** A resolved `depends-on` edge from `from` to `to`, both unit coordinates. */
export interface Edge {
  /** The depending unit's coordinate — always the declaring project (FR-003). */
  from: string;
  /** The depended-on unit's coordinate. */
  to: string;
  origin: EdgeOrigin;
  marks: EdgeMarks;
}

/** A declared edge naming a unit found nowhere (FR-008) — reported, never dropped. */
export interface DanglingEdge {
  from: string;
  /** The unresolvable target exactly as declared. */
  ref: string;
}

/** A malformed declaration (NFR-003) — reported, and the rest still resolves. */
export interface EdgeFinding {
  /** The offending entry verbatim, so a reader can find it in the config. */
  entry: string;
  reason: string;
}

/** Everything a resolve produced. Never throws; problems are values (NFR-003). */
export interface ResolvedEdges {
  edges: Edge[];
  dangling: DanglingEdge[];
  findings: EdgeFinding[];
}

/** One workspace member: its coordinate name and where it sits. */
export interface WorkspaceUnit {
  /** The package name exactly as the ecosystem writes it (D-002). */
  name: string;
  /** Repo-relative directory, for a reader who wants to open it. */
  dir: string;
  /** Names this member depends on, as its manifest states them. */
  dependsOn: readonly string[];
}
