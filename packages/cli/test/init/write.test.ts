import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveBundle } from '../../src/commands/init/bundle.js';
import { buildPlan } from '../../src/commands/init/plan.js';
import { executeWrites } from '../../src/commands/init/write.js';

/**
 * T-101 of specs/003-init-node-port/tasks.html. Unit tests for write.ts.
 */
describe('init: writer (T-101, FR-002, FR-008)', () => {
  it('executes a write-only plan and creates every file byte-identically to source', async () => {
    const inventory = resolveBundle();
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-init-write-'));
    const plan = buildPlan({ inventory, cwd });
    const summary = await executeWrites(plan);

    expect(summary.wrote).toBe(17);
    expect(summary.overwrote).toBe(0);
    expect(summary.skipped).toBe(0);

    // Byte-identity check on a handful of representative files.
    for (const sample of ['assets/spec.css', 'assets/spec.js', 'templates/spec.html']) {
      const inventoryEntry = inventory.files.find((f) => f.relativeDestination === sample);
      if (!inventoryEntry) throw new Error(`sample ${sample} not in inventory`);
      const sourceBytes = readFileSync(inventoryEntry.source);
      const destBytes = readFileSync(join(cwd, sample));
      expect(destBytes.equals(sourceBytes), `${sample} differs from bundle source`).toBe(true);
    }
  });

  it('respects "skip" action and counts correctly', async () => {
    const inventory = resolveBundle();
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-init-write-'));
    const plan = buildPlan({ inventory, cwd });

    // Mark the first three decisions as "skip"; rest stay "write".
    for (let i = 0; i < 3; i++) {
      const entry = plan[i];
      if (entry) entry.action = 'skip';
    }
    const summary = await executeWrites(plan);
    expect(summary.skipped).toBe(3);
    expect(summary.wrote).toBe(14);

    // Skipped destinations must not exist.
    for (let i = 0; i < 3; i++) {
      const entry = plan[i];
      if (entry) expect(existsSync(entry.destination)).toBe(false);
    }
  });

  it('respects "overwrite" action: counts as overwrote, writes correctly', async () => {
    const inventory = resolveBundle();
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-init-write-'));
    const plan = buildPlan({ inventory, cwd });

    // Pretend the first entry was a conflict the user chose to overwrite.
    const first = plan[0];
    if (!first) throw new Error('plan empty');
    first.action = 'overwrite';

    const summary = await executeWrites(plan);
    expect(summary.overwrote).toBe(1);
    expect(summary.wrote).toBe(16);
    expect(existsSync(first.destination)).toBe(true);
  });
});
