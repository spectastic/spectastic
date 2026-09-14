import { describe, expect, it } from 'vitest';
import { hasViolation, verdictFor } from '../src/guardrail/verdict.js';
import type { GovernanceDecision } from '../src/guardrail/types.js';

/**
 * Owner-aware verdict for a resource-scoped decision (spec 119, FR-003/004/006/007,
 * SC-001/SC-002). The four spike scenarios, tests-first: in the OWNER repo it
 * reproduces the path rule; in a NON-OWNER repo any touch flags — even a
 * well-layered one, because the defect is ownership, not layering.
 */

const NOW = new Date('2026-09-13T00:00:00.000Z');
const OWNER = 'position-keeper/position-keeper';
const CONSUMER = 'acme/reconciliation-service';

const D = (o: Partial<GovernanceDecision> & Pick<GovernanceDecision, 'id' | 'specId'>): GovernanceDecision => ({
  paths: [],
  modules: [],
  ...o,
});

// A resource-scoped decision: the positions store, owned by position-keeper,
// writable only inside its persistence adapter.
const RESOURCE_DECISION = D({
  id: 'D-007',
  specId: '002-downstream',
  status: 'accepted',
  reason: 'Every position change must emit PositionChanged so the audit hooks fire.',
  resource: {
    coordinate: 'spectastic://position-keeper/position-keeper/datastore/positions',
    owner: OWNER,
    allowedIn: 'src/**/persistence/**',
  },
  enforcement: { rules: [{ tool: 'native-content', id: 'no_direct_positions_write', pattern: 'UPDATE\\s+positions' }] },
});

const OUTSIDE = 'src/recon/Job.java'; // a job, outside the adapter
const INSIDE = 'src/app/persistence/Repo.java'; // the persistence adapter
const files: Record<string, string> = {
  [OUTSIDE]: 'void run() {\n  db.exec("UPDATE positions SET qty=0");\n}',
  [INSIDE]: 'void save() {\n  db.exec("UPDATE positions SET qty=?");\n}',
};
const readFile = (p: string) => files[p] ?? null;

const run = (changed: string[], currentProject: string | undefined) =>
  verdictFor({ changed, decisions: [RESOURCE_DECISION], now: NOW, readFile, currentProject });

describe('owner repo — reproduces the path rule (SC-001)', () => {
  it('A · write OUTSIDE the sanctioned path flags', () => {
    const v = run([OUTSIDE], OWNER);
    expect(hasViolation(v)).toBe(true);
    expect(v.violations[0]?.file).toBe(OUTSIDE);
  });
  it('B · write INSIDE the sanctioned path is clean', () => {
    expect(run([INSIDE], OWNER).violations).toEqual([]);
  });
});

describe('non-owner repo — any touch flags, ownership not layering (SC-002)', () => {
  it('C · a non-owner touch flags', () => {
    expect(hasViolation(run([OUTSIDE], CONSUMER))).toBe(true);
  });
  it('D · a WELL-LAYERED write in the non-owner’s OWN adapter still flags', () => {
    // INSIDE matches src/**/persistence/** — a path glob would call this clean.
    // Ownership, not layering: the consumer does not own the store.
    expect(hasViolation(run([INSIDE], CONSUMER))).toBe(true);
  });
  it('an absent/unqualified identity is treated as non-owner (fail safe)', () => {
    expect(hasViolation(run([INSIDE], undefined))).toBe(true);
    expect(hasViolation(run([INSIDE], 'position-keeper'))).toBe(true); // bare, not owner-qualified
  });
});

describe('cause + authority on the violation (spec 120, SC-001)', () => {
  const COORD = 'spectastic://position-keeper/position-keeper/datastore/positions';

  it('a non-owner touch records cause "ownership" + the store authority', () => {
    const hit = run([OUTSIDE], CONSUMER).violations[0];
    expect(hit?.cause).toBe('ownership');
    expect(hit?.owner).toBe(OWNER);
    expect(hit?.storeCoordinate).toBe(COORD);
  });

  it('the OWNER writing outside allowed-in is a "path" violation, not ownership', () => {
    const hit = run([OUTSIDE], OWNER).violations[0];
    expect(hit?.cause).toBe('path');
    expect(hit?.owner).toBeUndefined();
    expect(hit?.storeCoordinate).toBeUndefined();
  });

  it('a path-scoped decision records cause "path" with no authority', () => {
    const pathDecision = D({
      id: 'D-009',
      specId: '002-downstream',
      status: 'accepted',
      paths: [],
      reason: 'no direct writes',
      enforcement: { rules: [{ tool: 'native-content', id: 'x', pattern: 'UPDATE\\s+positions' }] },
    });
    const hit = verdictFor({
      changed: [OUTSIDE],
      decisions: [pathDecision],
      now: NOW,
      readFile,
      currentProject: CONSUMER,
    }).violations[0];
    expect(hit?.cause).toBe('path');
    expect(hit?.owner).toBeUndefined();
  });
});

describe('backward compatibility (FR-006)', () => {
  it('a path-scoped decision is unaffected by currentProject', () => {
    const pathDecision = D({
      id: 'D-009',
      specId: '002-downstream',
      status: 'accepted',
      paths: ['src/**/persistence/**'],
      reason: 'no direct writes outside the adapter',
      enforcement: { rules: [{ tool: 'native-content', id: 'x', pattern: 'UPDATE\\s+positions' }] },
    });
    const args = { decisions: [pathDecision], now: NOW, readFile };
    // Same verdict whether or not an identity is supplied — the resource branch never engages.
    expect(verdictFor({ ...args, changed: [OUTSIDE], currentProject: CONSUMER }).violations.length).toBe(1);
    expect(verdictFor({ ...args, changed: [INSIDE], currentProject: CONSUMER }).violations).toEqual([]);
    expect(verdictFor({ ...args, changed: [INSIDE] }).violations).toEqual([]);
  });
});
