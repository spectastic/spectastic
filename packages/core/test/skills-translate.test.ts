import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { skillName, translateToSkill, verbFromCommandFile } from '../src/skills/translate.js';

/**
 * The pure command→Agent-Skills translation (spec 111-codex-skill-adapters,
 * FR-002/003/004, NFR-001/003; D-005). Driven against the real command sources
 * so a change to the frontmatter contract is caught here.
 */

const COMMANDS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../commands');
const commandFiles = readdirSync(COMMANDS_DIR)
  .filter((f) => /^spectastic\..*\.md$/.test(f))
  .sort();

function read(file: string): string {
  return readFileSync(join(COMMANDS_DIR, file), 'utf8');
}

describe('name mapping (FR-002, NFR-003)', () => {
  it('maps a dotted command name to a lowercase-hyphen skill name', () => {
    expect(skillName('spectastic.spec.md')).toBe('spectastic-spec');
    expect(skillName('commands/spectastic.design.md')).toBe('spectastic-design');
  });

  it("the skill name equals the adapter's parent directory", () => {
    for (const file of commandFiles) {
      const { name, relPath } = translateToSkill(read(file), file);
      expect(relPath).toBe(`${name}/SKILL.md`);
    }
  });

  it('every name is standard-legal: lowercase-hyphen and at most 64 chars', () => {
    for (const file of commandFiles) {
      const { name } = translateToSkill(read(file), file);
      expect(name).toMatch(/^[a-z0-9-]+$/);
      expect(name.length).toBeLessThanOrEqual(64);
    }
  });
});

describe('frontmatter shape (FR-002, FR-004, NFR-003)', () => {
  it('produces valid YAML frontmatter that round-trips', () => {
    for (const file of commandFiles) {
      const { content, name } = translateToSkill(read(file), file);
      const fm = /^---\n([\s\S]*?)\n---/.exec(content)?.[1];
      expect(fm).toBeDefined();
      const parsed = parseYaml(fm as string) as Record<string, unknown>;
      expect(parsed.name).toBe(name);
      expect(typeof parsed.description).toBe('string');
      expect((parsed.description as string).length).toBeLessThanOrEqual(1024);
      expect((parsed.description as string).length).toBeGreaterThan(0);
    }
  });

  it('carries triggers / use-when / sibling-boundary into the metadata map', () => {
    const { content } = translateToSkill(read('spectastic.spec.md'), 'spectastic.spec.md');
    const fm = /^---\n([\s\S]*?)\n---/.exec(content)?.[1] as string;
    const meta = (parseYaml(fm) as { metadata?: Record<string, unknown> }).metadata;
    expect(meta).toBeDefined();
    expect(Array.isArray(meta?.triggers)).toBe(true);
    expect((meta?.triggers as string[]).length).toBeGreaterThan(0);
    expect(typeof meta?.['use-when']).toBe('string');
    expect(typeof meta?.['sibling-boundary']).toBe('string');
  });

  it('drops the Claude-only model tier and argument-hint from the frontmatter', () => {
    for (const file of commandFiles) {
      const { content } = translateToSkill(read(file), file);
      const fm = /^---\n([\s\S]*?)\n---/.exec(content)?.[1] as string;
      const parsed = parseYaml(fm) as Record<string, unknown>;
      expect(parsed.model).toBeUndefined();
      expect(parsed['argument-hint']).toBeUndefined();
      expect((parsed.metadata as Record<string, unknown> | undefined)?.model).toBeUndefined();
    }
  });

  it("the description equals the command's own", () => {
    const source = read('spectastic.spec.md');
    const sourceDesc = /^description:[ \t]*(.*)$/m.exec(source)?.[1]?.trim();
    const { content } = translateToSkill(source, 'spectastic.spec.md');
    const fm = /^---\n([\s\S]*?)\n---/.exec(content)?.[1] as string;
    expect((parseYaml(fm) as { description: string }).description).toBe(sourceDesc);
  });
});

describe('argument rewrite (FR-003)', () => {
  it('leaves no $ARGUMENTS token in any skill body', () => {
    for (const file of commandFiles) {
      const { content } = translateToSkill(read(file), file);
      expect(content).not.toContain('$ARGUMENTS');
    }
  });

  it('rewrites the backtick-wrapped form without leaving an empty code span', () => {
    const out = translateToSkill('---\ndescription: x\n---\nInput (from `$ARGUMENTS`) here.\n', 'spectastic.spec.md');
    expect(out.content).toContain("Input (from the user's request) here.");
    expect(out.content).not.toContain('``');
  });
});

describe('determinism (NFR-001)', () => {
  it('re-rendering the same source yields byte-identical output', () => {
    for (const file of commandFiles) {
      const src = read(file);
      expect(translateToSkill(src, file).content).toBe(translateToSkill(src, file).content);
    }
  });
});

describe('subagent degradation note (FR-010, FR-011, FR-012)', () => {
  const subagentVerbs = ['propose', 'implement', 'triage'];

  it('appends the host-neutral sub-pass note for subagent-using verbs only', () => {
    for (const file of commandFiles) {
      const { content } = translateToSkill(read(file), file);
      const verb = verbFromCommandFile(file);
      if (subagentVerbs.includes(verb)) {
        expect(content).toContain('Sub-pass note');
        expect(content).toContain('runs inline in this session');
      } else {
        expect(content).not.toContain('Sub-pass note');
      }
    }
  });

  it('names no specific host — a portable skill must not tell a Claude reader the fan-out ran inline (FR-012)', () => {
    for (const file of commandFiles) {
      const { content } = translateToSkill(read(file), file);
      expect(content).not.toContain('under Codex');
      expect(content).not.toContain('Running under Codex');
      expect(content).not.toContain('Codex has no subagent');
    }
  });

  it('emits a single SKILL.md adapter and no subagent file', () => {
    // The translator only ever produces one SKILL.md per command; it never
    // reads or emits an agents/ definition (FR-010 is enforced at the target
    // by translating commands/ only — asserted end-to-end in the CLI suite).
    const adapter = translateToSkill(read('spectastic.propose.md'), 'spectastic.propose.md');
    expect(adapter.relPath.endsWith('/SKILL.md')).toBe(true);
    expect(adapter.relPath).not.toContain('agents');
  });
});

describe('input guards', () => {
  it('throws on a command with no frontmatter', () => {
    expect(() => translateToSkill('# no frontmatter here\n', 'spectastic.spec.md')).toThrow(/frontmatter/);
  });
});

/**
 * Agent Skills conformance suite (spec 111, FR-012 / the 2026-09-12-claude-installs-skills
 * change, T-1006). No official machine-readable Agent Skills schema is published to vendor
 * against — it is a markdown+YAML convention — so this encodes the standard's documented
 * frontmatter contract: required name + description, name lowercase-hyphen ≤ 64 matching its
 * directory, description ≤ 1024, valid YAML, and only known top-level keys.
 */
describe('Agent Skills standard conformance (FR-012)', () => {
  const KNOWN_KEYS = new Set(['name', 'description', 'metadata', 'license', 'compatibility', 'allowed-tools']);

  it('every rendered skill obeys the documented frontmatter contract', () => {
    for (const file of commandFiles) {
      const { content, name, relPath } = translateToSkill(read(file), file);
      const fm = /^---\n([\s\S]*?)\n---/.exec(content)?.[1];
      expect(fm, `no frontmatter for ${file}`).toBeDefined();
      const parsed = parseYaml(fm as string) as Record<string, unknown>;

      // name: present, lowercase-hyphen, <=64, matches its parent directory.
      expect(typeof parsed.name).toBe('string');
      expect(parsed.name as string).toMatch(/^[a-z0-9-]+$/);
      expect((parsed.name as string).length).toBeLessThanOrEqual(64);
      expect(relPath).toBe(`${parsed.name}/SKILL.md`);
      expect(parsed.name).toBe(name);

      // description: present, <=1024.
      expect(typeof parsed.description).toBe('string');
      expect((parsed.description as string).length).toBeGreaterThan(0);
      expect((parsed.description as string).length).toBeLessThanOrEqual(1024);

      // only known top-level keys — an unknown key would fail a strict host.
      for (const key of Object.keys(parsed)) {
        expect(KNOWN_KEYS.has(key), `unknown top-level key "${key}" in ${file}`).toBe(true);
      }
    }
  });
});
