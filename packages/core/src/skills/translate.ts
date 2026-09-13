import { stringify as stringifyYaml } from 'yaml';

/**
 * Translate a spectastic command source (`commands/spectastic.*.md`) into an
 * Agent-Skills adapter — one `SKILL.md` per verb — for the Codex host target
 * (spec 111-codex-skill-adapters, D-001 / D-005).
 *
 * The command files are the single source of truth: the Claude adapter is a
 * verbatim copy of one, and the Codex adapter is a deterministic *translation*
 * of the same file. Determinism (NFR-001) is load-bearing — the drift gate
 * regenerates a skill and compares it byte-for-byte to what is on disk, so this
 * function may never read a clock, the network, or anything but its arguments.
 *
 * Field extraction uses line-anchored regexes rather than a YAML parse of the
 * source: a command `description:` is authored unquoted and may hold characters
 * a strict parse would reject, and the repo's own metadata rules read these
 * keys the same way. The OUTPUT frontmatter is serialised with `yaml` so
 * quoting/escaping is correct.
 */

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

/**
 * Verbs whose behaviour depends on a Claude Code subagent (propose's
 * adversarial pass, implement's parallel/escalation path, triage's list-intake
 * fan-out). The Agent Skills standard defines no nested-agent concept, so the
 * generated skill states, host-neutrally, that the sub-pass runs inline where a
 * host has no subagent mechanism (FR-011/FR-012).
 */
const SUBAGENT_VERBS = new Set(['propose', 'implement', 'triage']);

// A host-neutral degradation note (spec 111, FR-011/FR-012). The skill is a
// PORTABLE artifact — carried into whatever Agent Skills host opens the project
// — so the note must read correctly on every host, not name one. On a host with
// a subagent mechanism (e.g. Claude Code) the pass fans out; on one without
// (e.g. Codex) it runs inline. Naming "Codex" here was wrong the moment a
// non-Codex host consumed the same render (the double-tick-class defect the
// adversarial pass caught): a Claude skill must not tell its reader the fan-out
// ran inline. Phrasing it conditionally keeps one render honest everywhere.
const DEGRADATION_NOTE =
  '\n\n---\n\n' +
  '> **Sub-pass note.** This verb hands part of its work to a subagent — an ' +
  'adversarial risk pass, a parallel task fan-out, or a list-intake ' +
  'classification. On a host with a subagent mechanism that pass fans out; on a ' +
  'host without one it runs inline in this session instead.\n';

export interface SkillAdapter {
  /** The skill directory name, which is also the `SKILL.md` `name`. */
  readonly name: string;
  /** Path relative to the skills root, e.g. `spectastic-spec/SKILL.md`. */
  readonly relPath: string;
  /** The full `SKILL.md` file content. */
  readonly content: string;
}

/** Basename of a path, without importing `node:path` (keeps this leaf pure). */
function basename(file: string): string {
  const i = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
  return i >= 0 ? file.slice(i + 1) : file;
}

/** The verb a command file names, e.g. `spectastic.spec.md` → `spec`. */
export function verbFromCommandFile(file: string): string {
  return /spectastic\.([a-z-]+)\.md$/.exec(basename(file))?.[1] ?? '';
}

/**
 * The Agent-Skills `name` for a command file, e.g. `spectastic.spec.md` →
 * `spectastic-spec`. Lowercase-hyphen, matches its parent directory, and (for
 * every spectastic verb) well under the standard's 64-char limit (NFR-003).
 */
export function skillName(file: string): string {
  return basename(file)
    .replace(/\.md$/, '')
    .replace(/\./g, '-')
    .toLowerCase();
}

function firstValue(fm: string, key: string): string | undefined {
  const raw = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(fm)?.[1];
  return raw === undefined ? undefined : unquote(raw.trim());
}

function unquote(s: string): string {
  if (s.length >= 2 && ((s[0] === '"' && s.at(-1) === '"') || (s[0] === "'" && s.at(-1) === "'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/** The block list under a `key:` line, e.g. the `triggers:` items. */
function blockList(fm: string, key: string): string[] {
  const lines = fm.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^${key}:\\s*$`).test(l));
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) break;
    const m = /^\s*-\s*(.*)$/.exec(line);
    if (m?.[1] === undefined) break;
    out.push(unquote(m[1].trim()));
  }
  return out;
}

/**
 * Translate one command source into its Codex skill adapter. Deterministic:
 * same `commandMd` + `file` → byte-identical `content`.
 */
export function translateToSkill(commandMd: string, file: string): SkillAdapter {
  const match = FRONTMATTER_RE.exec(commandMd);
  if (match === null || match[1] === undefined) {
    throw new Error(`translateToSkill: ${basename(file)} has no YAML frontmatter`);
  }
  const fm = match[1];
  const body = commandMd.slice(match[0]?.length ?? 0);

  const name = skillName(file);
  const verb = verbFromCommandFile(file);
  const description = firstValue(fm, 'description') ?? '';

  // Carry the structured invocation metadata into the standard's optional
  // `metadata` map; `description` stays the authoritative trigger surface, and
  // the Claude-only `model` tier / `argument-hint` are dropped (D-005).
  const metadata: Record<string, unknown> = {};
  const triggers = blockList(fm, 'triggers');
  if (triggers.length > 0) metadata.triggers = triggers;
  const useWhen = firstValue(fm, 'use-when');
  if (useWhen !== undefined) metadata['use-when'] = useWhen;
  const siblingBoundary = firstValue(fm, 'sibling-boundary');
  if (siblingBoundary !== undefined) metadata['sibling-boundary'] = siblingBoundary;

  const front: Record<string, unknown> = { name, description };
  if (Object.keys(metadata).length > 0) front.metadata = metadata;

  // The standard has no argument mechanism, so the `$ARGUMENTS` token is
  // rewritten to read the user's message (FR-003). Handle the backtick-wrapped
  // form first so no empty code span is left behind.
  let outBody = body.replace(/`\$ARGUMENTS`/g, "the user's request").replace(/\$ARGUMENTS/g, "the user's request");
  if (SUBAGENT_VERBS.has(verb)) outBody += DEGRADATION_NOTE;

  const content = `---\n${stringifyYaml(front).trimEnd()}\n---\n${outBody}`;
  return { name, relPath: `${name}/SKILL.md`, content };
}
