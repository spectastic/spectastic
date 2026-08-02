/**
 * The Nx boundary reader (spec 081, D-001/D-004).
 *
 * Nx keeps its constraints in two places under two different key names, and its
 * tags in two more — verified against the Nx documentation while designing, and
 * the finding that reshaped this adapter:
 *
 *   constraints  ESLint config  → `@nx/enforce-module-boundaries`,
 *                                 `onlyDependOnLibsWithTags`
 *                nx.json        → `@nx/conformance/enforce-project-boundaries`,
 *                                 `onlyDependOnProjectsWithTags`
 *   tags         project.json   → `{ "tags": [...] }`
 *                package.json   → `{ "nx": { "tags": [...] } }`
 *
 * Reading only `nx.json` — the obvious guess — would miss the ESLint form,
 * which is the older and commoner one, and silently report no map for a project
 * that plainly has one.
 *
 * An ESLint config is JavaScript and is never executed (P-11, D-004): the
 * constraint block is JSON-shaped, so it is extracted textually, and a failed
 * extraction yields no map rather than a wrong one.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BoundaryMap } from '../boundary.js';

const ESLINT_CONFIGS = [
  'eslint.config.mjs',
  'eslint.config.js',
  'eslint.config.cjs',
  '.eslintrc.json',
  '.eslintrc',
] as const;

interface Constraint {
  sourceTag?: string;
  onlyDependOnLibsWithTags?: string[];
  onlyDependOnProjectsWithTags?: string[];
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Pull the `depConstraints` array out of a config as text.
 *
 * Brace-matched from the key rather than regex-captured, so a nested object
 * inside a constraint cannot truncate the block early. Returns `null` on any
 * doubt — the failure direction D-004 chose.
 */
function extractDepConstraints(raw: string): Constraint[] | null {
  const at = raw.indexOf('depConstraints');
  if (at === -1) return null;
  const open = raw.indexOf('[', at);
  if (open === -1) return null;

  let depth = 0;
  let end = -1;
  for (let i = open; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;

  // JS object literals use unquoted keys and may use single quotes; normalise
  // enough to parse as JSON, then give up rather than guess further.
  const block = raw
    .slice(open, end + 1)
    .replace(/'/g, '"')
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/,(\s*[\]}])/g, '$1');
  try {
    const parsed: unknown = JSON.parse(block);
    return Array.isArray(parsed) ? (parsed as Constraint[]) : null;
  } catch {
    return null;
  }
}

/** Constraints from the ESLint form, then the nx.json conformance form. */
function readConstraints(cwd: string): Constraint[] | null {
  for (const name of ESLINT_CONFIGS) {
    const path = join(cwd, name);
    if (!existsSync(path)) continue;
    try {
      const found = extractDepConstraints(readFileSync(path, 'utf8'));
      if (found !== null) return found;
    } catch {
      // unreadable — try the next candidate
    }
  }
  const nxPath = join(cwd, 'nx.json');
  if (existsSync(nxPath)) {
    try {
      const found = extractDepConstraints(readFileSync(nxPath, 'utf8'));
      if (found !== null) return found;
    } catch {
      // fall through
    }
  }
  return null;
}

/** Every tag any project declares, from either of its two locations. */
function readTags(cwd: string): Set<string> {
  const tags = new Set<string>();
  const addFrom = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const t of value) if (typeof t === 'string') tags.add(t);
    }
  };

  const visit = (dir: string, depth: number): void => {
    if (depth > 2) return; // bounded — never a tree walk (NFR-002)
    let entries: string[];
    try {
      entries = readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.'))
        .map((e) => e.name);
    } catch {
      return;
    }
    for (const name of entries) {
      const child = join(dir, name);
      const projectJson = readJson(join(child, 'project.json'));
      if (projectJson !== null) addFrom(projectJson.tags);
      const pkg = readJson(join(child, 'package.json'));
      const nx = pkg?.nx;
      if (typeof nx === 'object' && nx !== null) addFrom((nx as { tags?: unknown }).tags);
      visit(child, depth + 1);
    }
  };

  const rootProject = readJson(join(cwd, 'project.json'));
  if (rootProject !== null) addFrom(rootProject.tags);
  visit(cwd, 0);
  return tags;
}

/** The project's Nx boundary map, or `null` when it declares none usable. */
export function readNxBoundary(cwd: string): BoundaryMap | null {
  const constraints = readConstraints(cwd);
  if (constraints === null) return null;

  const units = readTags(cwd);
  const permitted: { from: string; to: string }[] = [];
  for (const c of constraints) {
    const from = c.sourceTag;
    if (typeof from !== 'string' || from === '') continue;
    units.add(from);
    const allowed = c.onlyDependOnLibsWithTags ?? c.onlyDependOnProjectsWithTags ?? [];
    for (const to of allowed) {
      if (typeof to !== 'string' || to === '') continue;
      units.add(to);
      permitted.push({ from, to });
    }
  }
  if (units.size === 0) return null;

  return {
    source: 'nx',
    units: [...units].sort(),
    permitted: permitted.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
  };
}
