/**
 * The local-export fetcher (spec 105-design-source-import).
 *
 * Resolves a directory that is already on disk and does nothing else — no
 * network, no credential, no protocol. That is what lets one code path serve
 * five design tools whose models agree about nothing except that they can put
 * a folder somewhere.
 */

import { resolve } from 'node:path';
import type { DesignSourceFetcher } from '../visual/source-fetcher.js';
import type { FileSystem } from '../types.js';

export class SourceNotFoundError extends Error {}

export function localSourceFetcher(fs: FileSystem, cwd: string): DesignSourceFetcher {
  return {
    async fetch(location: string): Promise<string> {
      // NO containment check here, deliberately — and this is the one path
      // check in this codebase that differs, so the absence is recorded rather
      // than left to read as an omission. FR-001 permits any local filesystem
      // location the author can read: a design tool drops its export in
      // ~/Downloads, and refusing to read it there rejected the only place one
      // ever actually is. Nothing is weakened by that, because the read side
      // was never what protected anything — every landed name comes from
      // `readdir` on the resolved source, which cannot express a traversal, and
      // FR-001's own write clause keeps output under the given destination.
      // The read-side bound that DOES matter is FR-019's symlink refusal, which
      // lives in the walk (visual/import.ts) where it applies to every source
      // shape rather than to this fetcher alone.
      const resolved = resolve(cwd, location);
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
