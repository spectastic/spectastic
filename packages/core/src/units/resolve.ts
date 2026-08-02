/**
 * The pure edge algebra (spec 079-unit-dependency-edge, design D-001).
 *
 * Pure by construction: no filesystem, no clock, no environment. It takes
 * candidate edges and a far-end lookup and returns a resolved set, so the rules
 * that decide what an edge is worth are testable with plain objects.
 *
 * Determinism matters here (NFR-003 on the verdict slice, and the estate's
 * standing expectation): the output order is sorted, never insertion- or
 * iteration-dependent.
 */

import { parseResourceUri, resourceUri } from '@spectastic/schema/project';
import type { DanglingEdge, Edge, EdgeFinding, FarEndVerdict, ResolvedEdges, WorkspaceUnit } from './types.js';

export interface ResolveInput {
  /** This project's own unit coordinate — the `from` of every declared edge. */
  self: string;
  /** Declared entries exactly as read from config, unvalidated. */
  declared: readonly string[];
  /** Units this workspace contains, used for inference and the dangling check. */
  units: readonly WorkspaceUnit[];
  /** What the far end says. Injected, so the algebra never reads a file. */
  farEnd: (target: string, depending: string) => FarEndVerdict;
  /** Edges inferred from manifests (FR-006). Declared entries outrank these (FR-007). */
  inferred?: readonly { from: string; to: string }[];
}

/** The project segment of a coordinate, or null when it will not parse. */
function projectOf(coordinate: string): string | null {
  const parsed = parseResourceUri(coordinate);
  return parsed.ok ? parsed.value.project : null;
}

/** The unit name a coordinate points at, or null when it is not a unit coordinate. */
function unitNameOf(coordinate: string): string | null {
  const parsed = parseResourceUri(coordinate);
  if (!parsed.ok || parsed.value.kind !== 'unit') return null;
  return parsed.value.name;
}

/**
 * An edge's identity is its (depending, depended-on) pair, never the target
 * alone. The separator is a control character so it cannot occur inside a
 * coordinate and collide two distinct pairs into one key.
 */
function edgeKey(from: string, to: string): string {
  return `${from}\u0000${to}`;
}

export function resolveEdges(input: ResolveInput): ResolvedEdges {
  // Keyed on the PAIR, not the target: the spec's data model says "the pair
  // (depending, depended-on) identifies the edge". Keying on the target alone
  // silently swallows every edge after the first that points at a given unit —
  // caught by running this on a real workspace, where three packages depend on
  // the same one and only the first survived.
  const edges = new Map<string, Edge>();
  const dangling: DanglingEdge[] = [];
  const findings: EdgeFinding[] = [];

  const selfProject = projectOf(input.self);
  const localNames = new Set(input.units.map((u) => u.name));

  for (const entry of input.declared) {
    const trimmed = entry.trim();
    if (trimmed === '') {
      findings.push({ entry, reason: 'empty entry' });
      continue;
    }
    const parsed = parseResourceUri(trimmed);
    if (!parsed.ok) {
      findings.push({ entry, reason: parsed.reason });
      continue;
    }

    // An in-project coordinate naming no local unit is *knowably* wrong, so it
    // is dangling (FR-008). A foreign coordinate is a different case: an absent
    // checkout says nothing about whether the unit exists, so it stays an edge
    // and the far-end lookup marks it unverified (FR-005).
    const name = unitNameOf(trimmed);
    const isLocal = selfProject !== null && parsed.value.project === selfProject;
    if (isLocal && name !== null && !localNames.has(name)) {
      dangling.push({ from: input.self, ref: trimmed });
      continue;
    }

    const verdict = input.farEnd(trimmed, input.self);
    edges.set(edgeKey(input.self, trimmed), {
      from: input.self,
      to: trimmed,
      origin: 'declared',
      marks: {
        verified: verdict !== 'unreadable',
        // Independent by construction: an unreadable far end can never have
        // agreed, so `reciprocated` is unreachable without `verified` (spec §4).
        reciprocated: verdict === 'agrees',
      },
    });
  }

  // Inference fills what nothing declared. A declaration for the same pair
  // already occupies the slot and wins (FR-007) — which is why this runs second
  // and never overwrites.
  for (const candidate of input.inferred ?? []) {
    if (edges.has(edgeKey(candidate.from, candidate.to))) continue;
    edges.set(edgeKey(candidate.from, candidate.to), {
      from: candidate.from,
      to: candidate.to,
      origin: 'inferred',
      marks: { verified: false, reciprocated: false },
    });
  }

  // Sorted on the whole pair, not the target: with inference, several units can
  // depend on the same one, so sorting by `to` alone leaves ties resolved by
  // insertion order — deterministic only by accident.
  const sortedEdges = [...edges.values()];
  sortedEdges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  const sortedDangling = [...dangling];
  sortedDangling.sort((a, b) => a.ref.localeCompare(b.ref));
  return { edges: sortedEdges, dangling: sortedDangling, findings };
}

/**
 * Turn workspace membership into candidate edges (FR-006).
 *
 * Pure, so it is testable without a directory: it maps each member's declared
 * dependencies onto the members that exist, by string equality on the package
 * name (D-002). An external dependency — one naming no member — is not an edge
 * between units and is dropped here rather than filtered downstream.
 *
 * `from` is the depending *member*, not the project: for an inferred intra-repo
 * edge the module is what depends, and FR-003's rule is that the depending unit
 * is the one an edge departs from.
 */
export function inferEdgesFromUnits(project: string, units: readonly WorkspaceUnit[]): { from: string; to: string }[] {
  const names = new Set(units.map((u) => u.name));
  const edges: { from: string; to: string }[] = [];
  for (const unit of units) {
    for (const dep of unit.dependsOn) {
      if (!names.has(dep) || dep === unit.name) continue;
      edges.push({
        from: resourceUri(project, 'unit', unit.name),
        to: resourceUri(project, 'unit', dep),
      });
    }
  }
  return edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}
