import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveBundle } from '../../src/commands/init/bundle.js';
import { buildPlan, findConflicts } from '../../src/commands/init/plan.js';

/**
 * T-100 of specs/003-init-node-port/tasks.html. Unit tests for plan.ts.
 */
describe('init: plan builder (T-100, FR-002)', () => {
  it('empty cwd produces decisions with action="write" and preExisting=false', () => {
    const inventory = resolveBundle();
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-init-plan-'));
    const plan = buildPlan({ inventory, cwd });
    expect(plan.length).toBe(16);
    expect(plan.every((d) => d.action === 'write')).toBe(true);
    expect(plan.every((d) => d.preExisting === false)).toBe(true);
  });

  it('every plan entry maps to the canonical destination layout', () => {
    const inventory = resolveBundle();
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-init-plan-'));
    const plan = buildPlan({ inventory, cwd });
    const destinations = plan.map((d) => d.destination.slice(cwd.length + 1)).sort();
    expect(destinations).toContain('.claude/commands/spectastic.spec.md');
    expect(destinations).toContain('assets/spec.css');
    expect(destinations).toContain('assets/spec.js');
    expect(destinations).toContain('templates/spec.html');
    expect(destinations).toContain('templates/principles.html');
    expect(destinations).toContain('templates/inbox.html');
  });

  it('marks preExisting when a destination already exists', () => {
    const inventory = resolveBundle();
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-init-plan-'));
    // Pre-create one destination to simulate a conflict.
    const conflictPath = join(cwd, 'assets', 'spec.css');
    const conflictDir = join(cwd, 'assets');
    mkdirSync(conflictDir, { recursive: true });
    writeFileSync(conflictPath, '/* existing user content */');

    const plan = buildPlan({ inventory, cwd });
    const conflicts = findConflicts(plan);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]?.destination).toBe(conflictPath);
    expect(existsSync(conflictPath)).toBe(true);
  });
});
