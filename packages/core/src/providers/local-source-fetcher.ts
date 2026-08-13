/**
 * The local-export fetcher (spec 105-design-source-import).
 *
 * Resolves a directory that is already on disk and does nothing else — no
 * network, no credential, no protocol. That is what lets one code path serve
 * five design tools whose models agree about nothing except that they can put
 * a folder somewhere.
 */

import { isAbsolute, relative, resolve } from 'node:path';
import type { DesignSourceFetcher } from '../visual/source-fetcher.js';
import type { FileSystem } from '../types.js';

export class SourceNotFoundError extends Error {}
export class SourceOutsideProjectError extends Error {}

export function localSourceFetcher(fs: FileSystem, cwd: string): DesignSourceFetcher {
  return {
    async fetch(location: string): Promise<string> {
      // Containment first, and on the declared string as well as the resolved
      // path — the same order every path check in this codebase uses, so a
      // traversal is rejected rather than stat-ed.
      if (isAbsolute(location)) {
        throw new SourceOutsideProjectError(
          `Source "${location}" is an absolute path. Point --from at a location inside the project.`,
        );
      }
      const resolved = resolve(cwd, location);
      const rel = relative(cwd, resolved);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        throw new SourceOutsideProjectError(`Source "${location}" resolves outside the project directory.`);
      }
      let stat: { isFile: boolean; isDirectory: boolean };
      try {
        stat = await fs.stat(resolved);
      } catch {
        throw new SourceNotFoundError(`No export at "${location}".`);
      }
      if (!stat.isDirectory) {
        throw new SourceNotFoundError(`"${location}" is not a directory. An export is a folder of files.`);
      }
      return resolved;
    },
  };
}
