/**
 * Reading a project's declared edges (spec 079-unit-dependency-edge, FR-009).
 *
 * Generalises the `consumes` key rather than introducing a second list beside
 * it: contract coordinates already living there stay valid, and a project has
 * one place to author a dependency instead of two that can drift.
 *
 * Fails soft in every direction, mirroring `contracts/notify.ts`'s existing
 * reader — no file, unreadable, malformed JSON, or a `consumes` that is not an
 * array of strings all degrade to `[]`. A hand-edited config must never crash a
 * read (NFR-003).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resourceUri } from '@spectastic/schema/project';

/** Read `consumes` from `<cwd>/spectastic.json`; `[]` on any failure. */
export function readDeclaredEdges(cwd: string): string[] {
  let raw: string;
  try {
    raw = readFileSync(join(cwd, 'spectastic.json'), 'utf8');
  } catch {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return [];
    const consumes = (parsed as { consumes?: unknown }).consumes;
    if (!Array.isArray(consumes)) return [];
    return consumes.filter((c): c is string => typeof c === 'string' && c.trim() !== '');
  } catch {
    return [];
  }
}

/** The `project` identity exactly as configured; `null` when absent or malformed. */
function readProject(cwd: string): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(cwd, 'spectastic.json'), 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const project = (parsed as { project?: unknown }).project;
    return typeof project === 'string' && project.trim() !== '' ? project.trim() : null;
  } catch {
    return null;
  }
}

/** The root manifest's package name, which is what other manifests reference (D-002). */
function readRootName(cwd: string): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const name = (parsed as { name?: unknown }).name;
    return typeof name === 'string' && name.trim() !== '' ? name.trim() : null;
  } catch {
    return null;
  }
}

/**
 * This project's own unit coordinate — the `from` of every edge it declares.
 *
 * A project is itself a unit (FR-001), named by its root manifest where it has
 * one. `null` when the project has no configured identity, since a coordinate
 * cannot be composed without one and inventing a default would mint a name
 * nothing else in the estate agrees with.
 */
export function selfUnitCoordinate(cwd: string): string | null {
  const project = readProject(cwd);
  if (project === null) return null;
  const name = readRootName(cwd) ?? project.split('/').pop() ?? project;
  return resourceUri(project, 'unit', name);
}
