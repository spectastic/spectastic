import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  adaptersManaged,
  driftPairs,
  generateAdapters,
  MANAGED_MARKER,
  removeAdapters,
} from '../../src/commands/init/adapters.js';
import { CODEX_TARGET } from '../../src/commands/init/adapters-codex.js';
import { commandsDriftFinding } from '@spectastic/core/commands/validate';

/**
 * The managed Codex adapter lifecycle (spec 111-codex-skill-adapters, US2:
 * FR-006/007/009, FR-010; SC-002/SC-004). Exercises the CODEX_TARGET render
 * (T-111) and the render(source) ≠ on-disk drift comparison the folded
 * scanSkillsDrift uses (T-211), without needing a real Codex session.
 */

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

const SPEC_SRC =
  '---\ndescription: Write a feature specification.\ntriggers:\n  - "write a spec"\nuse-when: "capturing what to build"\nsibling-boundary: "not design"\nmodel: inherit\n---\n# spec\nUser input (from `$ARGUMENTS`).\n';
const PROPOSE_SRC =
  '---\ndescription: Author a change proposal.\ntriggers:\n  - "change a spec"\nuse-when: "changing a spec"\nsibling-boundary: "not spec"\nmodel: inherit\n---\n# propose\nSpawn a spectastic-critic subagent.\n';

function seed(): string {
  dir = mkdtempSync(join(tmpdir(), 'target-codex-'));
  mkdirSync(join(dir, 'commands'), { recursive: true });
  writeFileSync(join(dir, 'commands', 'spectastic.spec.md'), SPEC_SRC);
  writeFileSync(join(dir, 'commands', 'spectastic.propose.md'), PROPOSE_SRC);
  return dir;
}

describe('managed Codex adapters (US2)', () => {
  it('generates .agents/skills/<verb>/SKILL.md + stamps the marker (FR-006)', () => {
    const cwd = seed();
    expect(generateAdapters(cwd, CODEX_TARGET).generated).toBe(2);
    expect(adaptersManaged(cwd, CODEX_TARGET)).toBe(true);
    const skill = readFileSync(join(cwd, '.agents', 'skills', 'spectastic-spec', 'SKILL.md'), 'utf8');
    expect(skill).toContain('name: spectastic-spec');
    expect(skill).not.toContain('$ARGUMENTS');
    expect(existsSync(join(cwd, '.agents', 'skills', MANAGED_MARKER))).toBe(true);
  });

  it('emits no subagent files into the Codex target (FR-010), but notes inline degradation (FR-011)', () => {
    const cwd = seed();
    generateAdapters(cwd, CODEX_TARGET);
    // No .claude/agents, no agents/ dir under the skills tree.
    expect(existsSync(join(cwd, '.claude', 'agents'))).toBe(false);
    const entries = readdirSync(join(cwd, '.agents', 'skills'));
    expect(entries.some((e) => e.includes('agent'))).toBe(false);
    // The subagent-using verb states the inline degradation.
    const propose = readFileSync(join(cwd, '.agents', 'skills', 'spectastic-propose', 'SKILL.md'), 'utf8');
    expect(propose).toContain('Sub-pass note');
  });

  it('is idempotent — re-generating rewrites identical content (NFR-001)', () => {
    const cwd = seed();
    generateAdapters(cwd, CODEX_TARGET);
    const first = readFileSync(join(cwd, '.agents', 'skills', 'spectastic-spec', 'SKILL.md'), 'utf8');
    generateAdapters(cwd, CODEX_TARGET);
    expect(readFileSync(join(cwd, '.agents', 'skills', 'spectastic-spec', 'SKILL.md'), 'utf8')).toBe(first);
  });

  it('drift check is clean when adapters match their rendered source (SC-002)', () => {
    const cwd = seed();
    generateAdapters(cwd, CODEX_TARGET);
    for (const pair of driftPairs(cwd, CODEX_TARGET)) {
      const onDisk = readFileSync(pair.adapter, 'utf8');
      expect(commandsDriftFinding(pair.expected, onDisk, pair.rel)).toBeNull();
    }
  });

  it('drift check fires at error severity when a managed skill is edited (SC-002)', () => {
    const cwd = seed();
    generateAdapters(cwd, CODEX_TARGET);
    const skillPath = join(cwd, '.agents', 'skills', 'spectastic-spec', 'SKILL.md');
    writeFileSync(skillPath, `${readFileSync(skillPath, 'utf8')}\nhand-edited drift\n`);
    const pair = driftPairs(cwd, CODEX_TARGET).find((p) => p.adapter === skillPath);
    const finding = commandsDriftFinding(pair!.expected, readFileSync(skillPath, 'utf8'), pair!.rel);
    expect(finding?.rule).toBe('commands-drift');
    expect(finding?.severity).toBe('error');
  });

  it('an unmarked .agents/skills tree is not judged (fail-safe)', () => {
    const cwd = seed();
    // No generate → no marker.
    expect(adaptersManaged(cwd, CODEX_TARGET)).toBe(false);
  });

  it('uninstall removes the skills + marker, leaving nothing managed (FR-009 / SC-004)', () => {
    const cwd = seed();
    generateAdapters(cwd, CODEX_TARGET);
    expect(removeAdapters(cwd, CODEX_TARGET).removed).toBe(2);
    expect(adaptersManaged(cwd, CODEX_TARGET)).toBe(false);
    expect(existsSync(join(cwd, '.agents', 'skills', 'spectastic-spec'))).toBe(false);
  });
});
