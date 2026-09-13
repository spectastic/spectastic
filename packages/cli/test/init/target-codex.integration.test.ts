import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { generateAdapters } from '../../src/commands/init/adapters.js';
import { CODEX_TARGET } from '../../src/commands/init/adapters-codex.js';

/**
 * The Codex drift gate, end to end through the built CLI (spec
 * 111-codex-skill-adapters, FR-008 / SC-002): a managed `.agents/skills`
 * adapter that has drifted from its rendered source makes `spectastic validate`
 * exit non-zero with a `commands-drift` error — which is exactly what the
 * pre-commit hook runs, so the commit is blocked.
 *
 * The CLI must be built (`pnpm -C packages/cli build`) — this spawns the built
 * `validate`, same convention as init.tools.integration.test.ts.
 */

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist/index.js');
const DOC =
  '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>x</title></head><body><p>hi</p></body></html>\n';

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function seedManagedCodex(): string {
  dir = mkdtempSync(join(tmpdir(), 'target-codex-int-'));
  mkdirSync(join(dir, 'commands'), { recursive: true });
  writeFileSync(
    join(dir, 'commands', 'spectastic.spec.md'),
    '---\ndescription: Write a spec.\ntriggers:\n  - "x"\nuse-when: "y"\nsibling-boundary: "z"\n---\n# spec\nInput (from `$ARGUMENTS`).\n',
  );
  writeFileSync(join(dir, 'doc.html'), DOC);
  generateAdapters(dir, CODEX_TARGET);
  return dir;
}

function validate(cwd: string): { code: number; out: string } {
  const r = spawnSync('node', [CLI, 'validate', 'doc.html'], { cwd, encoding: 'utf8' });
  return { code: r.status ?? 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

describe('Codex drift gate via the built CLI (SC-002)', () => {
  it('a clean managed adapter reports no commands-drift', () => {
    const cwd = seedManagedCodex();
    expect(validate(cwd).out).not.toContain('commands-drift');
  });

  it('the guarantee loop: a drift blocks, and regenerating clears it (SC-002 / T-218)', () => {
    const cwd = seedManagedCodex();
    const skill = join(cwd, '.agents', 'skills', 'spectastic-spec', 'SKILL.md');
    // Drift → validate reports the error (a commit would be blocked).
    writeFileSync(skill, `${readFileSync(skill, 'utf8')}\nhand-edited drift\n`);
    const blocked = validate(cwd);
    expect(blocked.code).not.toBe(0);
    expect(blocked.out).toContain('commands-drift');
    expect(blocked.out).toContain('.agents/skills/spectastic-spec/SKILL.md');
    // Regenerate from source → the drift clears.
    generateAdapters(cwd, CODEX_TARGET);
    expect(validate(cwd).out).not.toContain('commands-drift');
  });
});

describe('Codex scaffold via the built CLI (US1: FR-001/005)', () => {
  it('init --target codex writes a SKILL.md per core verb and no .claude/*', () => {
    dir = mkdtempSync(join(tmpdir(), 'codex-init-'));
    const r = spawnSync('node', [CLI, 'init', '--target', 'codex', '--force'], { cwd: dir, encoding: 'utf8' });
    expect(r.status, `stderr: ${r.stderr}\nstdout: ${r.stdout}`).toBe(0);
    for (const verb of ['spec', 'design', 'tasks', 'implement', 'propose', 'apply', 'principles', 'triage']) {
      expect(existsSync(join(dir, '.agents', 'skills', `spectastic-${verb}`, 'SKILL.md'))).toBe(true);
    }
    // Extended verbs are not scaffolded by default; no Claude adapters either.
    expect(existsSync(join(dir, '.agents', 'skills', 'spectastic-explain'))).toBe(false);
    expect(existsSync(join(dir, '.claude', 'commands'))).toBe(false);
    // Shared trees still land — the verbs generate HTML artifacts.
    expect(existsSync(join(dir, 'assets', 'spec.css'))).toBe(true);
    expect(existsSync(join(dir, 'templates', 'spec.html'))).toBe(true);
  });
});

describe('default (Claude) scaffold ships both surfaces via the built CLI (FR-012 / SC-005)', () => {
  it('plain init writes BOTH .claude/commands and .agents/skills for each core verb', () => {
    dir = mkdtempSync(join(tmpdir(), 'claude-init-'));
    const r = spawnSync('node', [CLI, 'init', '--force'], { cwd: dir, encoding: 'utf8' });
    expect(r.status, `stderr: ${r.stderr}\nstdout: ${r.stdout}`).toBe(0);
    for (const verb of ['spec', 'design', 'tasks', 'implement', 'propose', 'apply', 'principles', 'triage']) {
      expect(existsSync(join(dir, '.claude', 'commands', `spectastic.${verb}.md`))).toBe(true);
      expect(existsSync(join(dir, '.agents', 'skills', `spectastic-${verb}`, 'SKILL.md'))).toBe(true);
    }
    // Extended verbs stay gated on --with, for both surfaces.
    expect(existsSync(join(dir, '.claude', 'commands', 'spectastic.explain.md'))).toBe(false);
    expect(existsSync(join(dir, '.agents', 'skills', 'spectastic-explain'))).toBe(false);
  });

  it('--with opts an extended verb into both surfaces', () => {
    dir = mkdtempSync(join(tmpdir(), 'claude-init-with-'));
    const r = spawnSync('node', [CLI, 'init', '--with', 'explain', '--force'], { cwd: dir, encoding: 'utf8' });
    expect(r.status, `stderr: ${r.stderr}\nstdout: ${r.stdout}`).toBe(0);
    expect(existsSync(join(dir, '.claude', 'commands', 'spectastic.explain.md'))).toBe(true);
    expect(existsSync(join(dir, '.agents', 'skills', 'spectastic-explain', 'SKILL.md'))).toBe(true);
  });

  it('the Claude skill carries the host-neutral note, never "under Codex" (FR-012)', () => {
    dir = mkdtempSync(join(tmpdir(), 'claude-init-note-'));
    spawnSync('node', [CLI, 'init', '--force'], { cwd: dir, encoding: 'utf8' });
    const propose = readFileSync(join(dir, '.agents', 'skills', 'spectastic-propose', 'SKILL.md'), 'utf8');
    expect(propose).toContain('Sub-pass note');
    expect(propose).not.toContain('under Codex');
  });
});

describe('Claude --tools manages + drift-guards both trees (FR-013 / SC-002)', () => {
  // A managed install needs a commands/ source, so seed one (the dev repo shape).
  function seedManaged(): string {
    const cwd = mkdtempSync(join(tmpdir(), 'claude-tools-'));
    mkdirSync(join(cwd, 'commands'), { recursive: true });
    for (const verb of ['spec', 'propose']) {
      writeFileSync(
        join(cwd, 'commands', `spectastic.${verb}.md`),
        `---\ndescription: ${verb}.\ntriggers:\n  - "x"\nuse-when: "y"\nsibling-boundary: "z"\n---\n# ${verb}\nInput (from \`$ARGUMENTS\`).\n`,
      );
    }
    writeFileSync(join(cwd, 'doc.html'), DOC);
    spawnSync('git', ['init'], { cwd });
    spawnSync('node', [CLI, 'init', '--tools', '--force'], { cwd, encoding: 'utf8' });
    return cwd;
  }

  it('stamps a managed marker in BOTH .claude/commands and .agents/skills', () => {
    dir = seedManaged();
    expect(existsSync(join(dir, '.claude', 'commands', '.spectastic-managed'))).toBe(true);
    expect(existsSync(join(dir, '.agents', 'skills', '.spectastic-managed'))).toBe(true);
  });

  it('a drifted managed Claude skill is caught by validate (drift-guarded)', () => {
    dir = seedManaged();
    const skill = join(dir, '.agents', 'skills', 'spectastic-spec', 'SKILL.md');
    writeFileSync(skill, `${readFileSync(skill, 'utf8')}\nhand-edited drift\n`);
    const r = validate(dir);
    expect(r.code).not.toBe(0);
    expect(r.out).toContain('commands-drift');
    expect(r.out).toContain('.agents/skills/spectastic-spec/SKILL.md');
  });
});
