import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveBundle } from '../../src/commands/init/bundle.js';
import {
  buildPlan,
  findConflicts,
  SCAFFOLD_FILE_COUNT,
  SCAFFOLD_TREE_FILE_COUNT,
} from '../../src/commands/init/plan.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * T-100 of specs/003-init-node-port/tasks.html. Unit tests for plan.ts.
 */
describe('init: plan builder (T-100, FR-002)', () => {
  it('empty cwd produces decisions with action="write" and preExisting=false', () => {
    const inventory = resolveBundle();
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-init-plan-'));
    const plan = buildPlan({ inventory, cwd });
    expect(plan.length).toBe(SCAFFOLD_FILE_COUNT);
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
    expect(destinations).toContain('assets/theme-boot.js');
    expect(destinations).toContain('assets/favicon.svg');
    expect(destinations).toContain('templates/spec.html');
    expect(destinations).toContain('templates/principles.html');
    expect(destinations).toContain('templates/inbox.html');
    expect(destinations).toContain('templates/triage-log.html');
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

/**
 * T-1005 (applied change 2026-07-23-prerelease-latest-dist-tag). The scaffold
 * size had drifted three ways at once — 004's SC-001 said 16, init.ts's docblock
 * said 17, the tests asserted 20, and the real tree was 21 — because two
 * different numbers (bundle files vs the on-disk tree) were being used
 * interchangeably. These guards bind both to their single source, so the next
 * scaffold change fails here instead of silently rotting the success criterion.
 */
describe('scaffold count drift guard (004 SC-001, T-1005)', () => {
  it('the tree is exactly the bundle files plus the generated .gitignore', () => {
    expect(SCAFFOLD_TREE_FILE_COUNT).toBe(SCAFFOLD_FILE_COUNT + 1);
  });

  it("004's SC-001 states the canonical tree count", () => {
    const spec = readFileSync(
      join(here, '..', '..', '..', '..', 'specs', '004-npm-publish-workflow', 'spec.html'),
      'utf8',
    );
    const sc001 = /<spec-requirement id="SC-001"[\s\S]*?<\/spec-requirement>/.exec(spec)?.[0];
    expect(sc001, 'SC-001 not found in 004/spec.html').toBeTruthy();

    const stated = /yields a (\d+)-file tree/.exec(sc001 ?? '')?.[1];
    expect(stated, 'SC-001 no longer states an "N-file tree"').toBeTruthy();
    expect(
      Number(stated),
      `SC-001 says ${stated}-file tree but the scaffold produces ${SCAFFOLD_TREE_FILE_COUNT}`,
    ).toBe(SCAFFOLD_TREE_FILE_COUNT);
  });
});
