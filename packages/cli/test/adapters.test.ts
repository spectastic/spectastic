import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { adaptersManaged, generateAdapters, MANAGED_MARKER, removeAdapters } from '../src/commands/init/adapters.js';

/**
 * T-202 of specs/031-init-tools/tasks.html. The adapter generator (US2 / D-001):
 * generates .claude/commands verbatim from source, stamps a manager marker,
 * is idempotent, and removes cleanly.
 */
let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function seed(): string {
  dir = mkdtempSync(join(tmpdir(), 'adapters-'));
  mkdirSync(join(dir, 'commands'), { recursive: true });
  writeFileSync(join(dir, 'commands', 'spectastic.spec.md'), '---\ndescription: verbatim SOURCE\n---\n# spec\n');
  return dir;
}

describe('command adapters (US2)', () => {
  it('generates adapters verbatim from source + stamps the marker (FR-007/008)', () => {
    const cwd = seed();
    expect(generateAdapters(cwd).generated).toBe(1);
    expect(adaptersManaged(cwd)).toBe(true);
    expect(readFileSync(join(cwd, '.claude', 'commands', 'spectastic.spec.md'), 'utf8')).toContain('verbatim SOURCE');
    expect(existsSync(join(cwd, '.claude', 'commands', MANAGED_MARKER))).toBe(true);
  });

  it('is idempotent — re-generating rewrites identical content (FR-001)', () => {
    const cwd = seed();
    generateAdapters(cwd);
    const first = readFileSync(join(cwd, '.claude', 'commands', 'spectastic.spec.md'), 'utf8');
    expect(generateAdapters(cwd).generated).toBe(1);
    expect(readFileSync(join(cwd, '.claude', 'commands', 'spectastic.spec.md'), 'utf8')).toBe(first);
  });

  it('a project with no commands/ source generates nothing', () => {
    dir = mkdtempSync(join(tmpdir(), 'adapters-'));
    expect(generateAdapters(dir).generated).toBe(0);
    expect(adaptersManaged(dir)).toBe(false);
  });

  it('removeAdapters clears managed adapters + marker (FR-010)', () => {
    const cwd = seed();
    generateAdapters(cwd);
    expect(removeAdapters(cwd).removed).toBe(1);
    expect(adaptersManaged(cwd)).toBe(false);
    expect(existsSync(join(cwd, '.claude', 'commands', 'spectastic.spec.md'))).toBe(false);
  });
});
