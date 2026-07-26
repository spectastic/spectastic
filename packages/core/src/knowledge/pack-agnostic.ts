/**
 * The portable-domain-skill agnosticism check (057-portable-domain-skill,
 * plan D-001–D-004).
 *
 * A domain pack is a distributable Agent Skill; a marketplace.json is what
 * declares it so (D-002) — the check inspects ONLY packs a marketplace.json
 * lists, never spectastic's own dogfood/scaffold packs (which legitimately
 * name spectastic; checking them was 052's SC-003 false-positive). Two legs:
 *  - portability (FR-001/FR-003/SC-003): the pack carries no spectastic
 *    vocabulary — never the KB-NNN/provenance convention itself, which is
 *    the *portable* corpus contract 051 already established (D-003);
 *  - discoverability (FR-004/D-004): the pack's SKILL.md carries a present,
 *    non-trivial `description` — the Agent Skills progressive-disclosure
 *    surface an agent reads before anything else. Presence is checked here;
 *    the *quality* of a description's triggering stays authored, review-caught.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Finding } from '@spectastic/schema';

const RULE_PORTABLE = 'pack-not-portable';
const RULE_DISCOVERABLE = 'pack-not-discoverable';
const SKILL_FILE = 'SKILL.md';
const REFERENCES_DIR = 'references';
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Spectastic vocabulary a portable pack must never carry (D-003) — never
 * the KB-NNN id / provenance-field / index.md convention, which is the
 * *portable* corpus contract 051 already establishes. */
const SPECTASTIC_TOKENS: ReadonlyArray<{ token: string; re: RegExp }> = [
  { token: '<spec-*> artifact tag', re: /<spec-[a-z-]+/i },
  { token: 'grounding= attribute', re: /\bgrounding\s*=/i },
  { token: '/spectastic. verb name', re: /\/spectastic\.[a-z]+/i },
  { token: 'the word "spectastic"', re: /\bspectastic\b/i },
];

function portableFinding(file: string, token: string): Finding {
  return {
    file,
    line: 1,
    column: 1,
    rule: RULE_PORTABLE,
    severity: 'error',
    message: `${file} embeds ${token} — a portability defect (a distributable pack must carry zero spectastic-specific instructions).`,
    fixHint: 'Remove the spectastic-specific text; a domain pack should read the same in or out of a spectastic repo.',
  };
}

function discoverableFinding(file: string): Finding {
  return {
    file,
    line: 1,
    column: 1,
    rule: RULE_DISCOVERABLE,
    severity: 'warning',
    message: `${file} has no (or a trivial) SKILL.md description — an agent's discovery pass reads this before anything else.`,
    fixHint: 'Add a rich description naming the domains/phases this pack is useful for; that is what an agent matches against before reading the full skill.',
  };
}

/** A description under this length reads as a placeholder, not a real
 * discovery surface — deliberately generous so a real one-liner never
 * false-positives. */
const TRIVIAL_DESCRIPTION_LEN = 20;

/** Parse a SKILL.md's `---`-fenced frontmatter for its `description`, or
 * `null` if absent/unparseable/too short to be a real discovery surface. */
function skillDescription(raw: string): string | null {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match?.[1]) return null;
  try {
    const parsed = parseYaml(match[1]) as Record<string, unknown> | null;
    const description = parsed && typeof parsed.description === 'string' ? parsed.description.trim() : '';
    return description.length >= TRIVIAL_DESCRIPTION_LEN ? description : null;
  } catch {
    return null;
  }
}

/** Every markdown file in a pack worth scanning for portability: its
 * SKILL.md plus every `references/*.md` document. */
function packMarkdownFiles(packDir: string): string[] {
  const files: string[] = [];
  const skillPath = join(packDir, SKILL_FILE);
  if (existsSync(skillPath)) files.push(skillPath);
  const referencesDir = join(packDir, REFERENCES_DIR);
  if (existsSync(referencesDir)) {
    for (const name of readdirSync(referencesDir).sort()) {
      const filePath = join(referencesDir, name);
      if (name.endsWith('.md') && statSync(filePath).isFile()) files.push(filePath);
    }
  }
  return files;
}

/** All findings for one distributable pack directory: a portability finding
 * per spectastic-token leak, plus a discoverability finding when its
 * SKILL.md carries no real description. */
function packFindings(packDir: string): Finding[] {
  const findings: Finding[] = [];
  for (const file of packMarkdownFiles(packDir)) {
    const content = readFileSync(file, 'utf8');
    for (const { token, re } of SPECTASTIC_TOKENS) {
      if (re.test(content)) findings.push(portableFinding(file, token));
    }
  }

  const skillPath = join(packDir, SKILL_FILE);
  if (existsSync(skillPath) && skillDescription(readFileSync(skillPath, 'utf8')) === null) {
    findings.push(discoverableFinding(skillPath));
  }

  return findings;
}

interface MarketplacePlugin {
  source?: string;
}

interface MarketplaceManifest {
  plugins?: MarketplacePlugin[];
}

/** Resolve the pack directories a `marketplace.json` declares distributable
 * — each `plugins[].source`, relative to the manifest's own directory. A
 * malformed or missing manifest resolves to no packs (never a crash). */
export function resolveMarketplacePacks(marketplacePath: string): string[] {
  if (!existsSync(marketplacePath)) return [];
  let manifest: MarketplaceManifest;
  try {
    manifest = JSON.parse(readFileSync(marketplacePath, 'utf8')) as MarketplaceManifest;
  } catch {
    return [];
  }
  const baseDir = dirname(marketplacePath);
  return (manifest.plugins ?? [])
    .map((p) => p.source)
    .filter((source): source is string => typeof source === 'string' && source.length > 0)
    .map((source) => resolve(baseDir, source));
}

/**
 * Every agnosticism finding for the packs a `marketplace.json` at
 * `marketplacePath` declares distributable. `[]` when the manifest is
 * absent — spectastic's own un-listed packs are never inspected (D-002),
 * and NFR-001's ceiling (a pack the tool never sees stays unchecked) holds
 * by construction, not by an exemption list.
 */
export function packAgnosticismFindings(marketplacePath: string): Finding[] {
  const packDirs = resolveMarketplacePacks(marketplacePath);
  return packDirs.flatMap((dir) => packFindings(dir));
}
