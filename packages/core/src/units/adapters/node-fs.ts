/**
 * The filesystem implementation of the workspace port (design D-001).
 *
 * The only module in this slice that touches a disk. Everything it can fail at
 * degrades to a value — an empty unit list, or an `unreadable` verdict — so a
 * missing checkout or a hand-mangled config can never raise (NFR-003).
 */

import { readFileSync } from 'node:fs';
import { readConfigFile } from '@spectastic/schema/config';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { parseResourceUri } from '@spectastic/schema/project';
import type { WorkspacePort } from '../port.js';
import type { FarEndVerdict, WorkspaceUnit } from '../types.js';
import { enumerateJsUnits } from './js.js';

/**
 * Where a foreign project's checkout might sit.
 *
 * A coordinate names a project, not a path, so locating it is a convention
 * rather than a lookup: the sibling directory beside this checkout, named for
 * the project's last segment. That is how repositories are ordinarily laid out,
 * and when the guess is wrong the answer is `unreadable` — which is a real
 * answer (FR-005), not a failure. No search, no network, no configuration.
 */
function candidateCheckouts(cwd: string, targetProject: string): string[] {
  const absolute = resolvePath(cwd);
  const repoName = targetProject.split('/').pop();
  if (repoName === undefined || repoName === '') return [];
  return [join(dirname(absolute), repoName)];
}

/** A project's declared `consumes` entries; `[]` for every failure. */
function consumesAt(projectDir: string): string[] {
  try {
    const parsed: unknown = readConfigFile(projectDir);
    if (typeof parsed !== 'object' || parsed === null) return [];
    const consumes = (parsed as { consumes?: unknown }).consumes;
    if (!Array.isArray(consumes)) return [];
    return consumes.filter((c): c is string => typeof c === 'string');
  } catch {
    return [];
  }
}

export function nodeFsWorkspacePort(cwd: string): WorkspacePort {
  return {
    units(): readonly WorkspaceUnit[] {
      return enumerateJsUnits(cwd);
    },

    farEnd(targetCoordinate: string, dependingCoordinate: string): FarEndVerdict {
      const parsed = parseResourceUri(targetCoordinate);
      if (!parsed.ok) return 'unreadable';

      const selfParsed = parseResourceUri(dependingCoordinate);
      // A target inside this same project is readable by definition — this
      // checkout is the far end. It has one config, which is the depending
      // unit's own, so it cannot independently agree; `silent` is the honest
      // answer rather than a self-reciprocating edge.
      if (selfParsed.ok && parsed.value.project === selfParsed.value.project) return 'silent';

      for (const dir of candidateCheckouts(cwd, parsed.value.project)) {
        let entries: string[];
        try {
          entries = consumesAt(dir);
        } catch {
          continue;
        }
        // Readable. Agreement must name the depending unit specifically —
        // merely having entries is not agreement (the risk the design registers).
        if (entries.length === 0 && !readable(dir)) continue;
        return entries.includes(dependingCoordinate) ? 'agrees' : 'silent';
      }
      return 'unreadable';
    },
  };
}

/** Whether a candidate checkout exists at all, distinguishing absent from empty. */
function readable(projectDir: string): boolean {
  try {
    readFileSync(join(projectDir, 'spectastic.json'), 'utf8');
    return true;
  } catch {
    return false;
  }
}
