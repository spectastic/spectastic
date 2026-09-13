import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translateToSkill } from '@spectastic/core/skills/translate';
import { describe, expect, it } from 'vitest';
import { resolveBundle } from '../../src/commands/init/bundle.js';
import { buildPlan, SCAFFOLD_FILE_COUNT } from '../../src/commands/init/plan.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/**
 * The NFR-002 / SC-003 fence for spec 111-codex-skill-adapters.
 *
 * Originally: "adding `--target codex` MUST NOT change the default output."
 * Reconciled by the 2026-09-12-claude-installs-skills change: the default now
 * DELIBERATELY gains the portable `.agents/skills` tree (FR-012), so NFR-002 is
 * now "everything BUT the skills tree stays byte-identical." This snapshot is
 * that non-skills fence.
 *
 * These tests run in dev/vitest mode, where `resolveBundle` falls back to the
 * workspace root — which has no rendered `.agents/skills` (those live only in
 * the prebuilt bundle). So the map here naturally contains only the non-skills
 * files, and a change to any of them still trips the snapshot. The other half
 * of the invariant — that the skills tree IS present in a real (production)
 * scaffold — is verified against the built CLI in target-codex.integration.test.ts
 * (SC-005), because the skills exist only after prebuild renders them.
 */

function defaultScaffoldMap(): Array<{ dest: string; source: string }> {
  const inventory = resolveBundle();
  const cwd = mkdtempSync(join(tmpdir(), 'spectastic-default-scaffold-'));
  const plan = buildPlan({ inventory, cwd });
  return plan
    .map((d) => ({
      dest: d.destination.slice(cwd.length + 1),
      // Skill entries are content-rendered (no source file); commands/assets are copied.
      source: d.source ? basename(d.source) : '(rendered)',
    }))
    .sort((a, b) => a.dest.localeCompare(b.dest));
}

describe('default init scaffold (NFR-002 / SC-003 fence)', () => {
  it('writes exactly SCAFFOLD_FILE_COUNT files from the bundle', () => {
    expect(defaultScaffoldMap().length).toBe(SCAFFOLD_FILE_COUNT);
  });

  it('maps each destination from its expected source — the golden default', () => {
    expect(defaultScaffoldMap()).toMatchSnapshot();
  });

  it('is stable across repeated builds (determinism)', () => {
    expect(defaultScaffoldMap()).toEqual(defaultScaffoldMap());
  });
});

/**
 * The render-equivalence guard (004 SC-001 via the 2026-09-12-skills-grow-the-tree change).
 * SC-001's "byte-identical to the local-clone install" now rests on the dev renderer and the
 * prebuild renderer agreeing: a local clone RENDERS the skills at init time, the published
 * package COPIES pre-rendered ones from the bundle. They must match byte-for-byte. Requires
 * the built bundle (prebuild has run) — same convention as the other bundle-backed init tests.
 */
describe('skill render equivalence: dev render === prebuilt bundle (004 SC-001)', () => {
  const bundleSkills = resolve(REPO_ROOT, 'packages/cli/_bundled/.agents/skills');
  const commandsDir = resolve(REPO_ROOT, 'commands');

  it.runIf(existsSync(bundleSkills))('each dev-rendered SKILL.md equals the prebuilt bundle byte-for-byte', () => {
    const sources = readdirSync(commandsDir).filter((f) => /^spectastic\..*\.md$/.test(f));
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      const rendered = translateToSkill(readFileSync(join(commandsDir, file), 'utf8'), file);
      const onDisk = readFileSync(join(bundleSkills, rendered.relPath), 'utf8');
      expect(onDisk, `bundle skill ${rendered.relPath} differs from a fresh dev render`).toBe(rendered.content);
    }
  });
});
