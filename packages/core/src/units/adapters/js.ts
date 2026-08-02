/**
 * JavaScript workspace enumeration (spec 079-unit-dependency-edge, FR-006).
 *
 * Covers the two ways a JS workspace declares its members: the `workspaces`
 * field in the root manifest (npm, yarn, bun) and `pnpm-workspace.yaml`. Both,
 * because this repository uses only the second — a JSON-only reader finds zero
 * units here, and a feature blind to its own repository can only be tested
 * against synthetic fixtures (design D-003).
 *
 * Enumeration is bounded by the declared globs and never walks the tree
 * (NFR-001). Only a trailing `*` is expanded, which is what every real
 * workspace glob uses; anything more exotic is treated as a literal path and
 * simply will not match, rather than triggering a recursive search.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { WorkspaceUnit } from '../types.js';

/** Dependency sections that express a real build dependency between units. */
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

function readJson(path: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The workspace globs a project declares, from either convention. */
function readGlobs(cwd: string): string[] {
  const globs: string[] = [];

  const root = readJson(join(cwd, 'package.json'));
  const ws = root?.workspaces;
  if (Array.isArray(ws)) {
    globs.push(...ws.filter((g): g is string => typeof g === 'string'));
  } else if (typeof ws === 'object' && ws !== null && Array.isArray((ws as { packages?: unknown }).packages)) {
    // yarn's object form: { packages: [...] }
    globs.push(...(ws as { packages: unknown[] }).packages.filter((g): g is string => typeof g === 'string'));
  }

  try {
    const yamlRaw = readFileSync(join(cwd, 'pnpm-workspace.yaml'), 'utf8');
    const parsed: unknown = parseYaml(yamlRaw);
    const packages = (parsed as { packages?: unknown } | null)?.packages;
    if (Array.isArray(packages)) {
      globs.push(...packages.filter((g): g is string => typeof g === 'string'));
    }
  } catch {
    // Absent or malformed — the other convention may still have supplied globs.
  }

  return [...new Set(globs)];
}

/** Expand one glob to candidate directories. Trailing `*` only; no recursion. */
function expand(cwd: string, glob: string): string[] {
  const cleaned = glob.replace(/\/\*\*$/, '/*');
  if (!cleaned.endsWith('/*')) {
    return existsSync(join(cwd, cleaned)) ? [cleaned] : [];
  }
  const parent = cleaned.slice(0, -2);
  try {
    return readdirSync(join(cwd, parent), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => `${parent}/${e.name}`);
  } catch {
    return [];
  }
}

/**
 * Every workspace member, with the names its manifest depends on.
 *
 * Sorted, so the result never depends on directory iteration order — the
 * determinism the estate expects of anything reading artifacts.
 */
export function enumerateJsUnits(cwd: string): WorkspaceUnit[] {
  const dirs = new Set<string>();
  for (const glob of readGlobs(cwd)) {
    for (const dir of expand(cwd, glob)) dirs.add(dir);
  }

  const units: WorkspaceUnit[] = [];
  for (const dir of dirs) {
    const manifest = readJson(join(cwd, dir, 'package.json'));
    const name = manifest?.name;
    if (typeof name !== 'string' || name.trim() === '') continue; // not a package

    const dependsOn = new Set<string>();
    for (const section of DEPENDENCY_SECTIONS) {
      const deps = manifest?.[section];
      if (typeof deps !== 'object' || deps === null) continue;
      for (const dep of Object.keys(deps)) dependsOn.add(dep);
    }
    units.push({ name: name.trim(), dir, dependsOn: [...dependsOn].sort() });
  }

  return units.sort((a, b) => a.name.localeCompare(b.name));
}
