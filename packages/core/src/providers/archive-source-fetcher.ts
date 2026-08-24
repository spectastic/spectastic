/**
 * An archive as an import source (spec 105-design-source-import, FR-013).
 *
 * FR-001 requires the source to be on the local filesystem and assigns nobody
 * the job of putting it there. In practice that made the import unreachable
 * through any documented path — reading a design tool programmatically returns
 * file *content* with no way to write it, so material passes through a model's
 * context and a large bundle cannot land at all.
 *
 * Every one of these tools exports a zip, and a zip on disk already satisfies
 * FR-001 as written. So this is not a relaxation: it is one adapter serving
 * every source, in place of the per-tool fetchers FR-001 exists to prevent.
 * Nothing here downloads — an archive is opened, never fetched.
 *
 * Deliberately dependency-free. The container format is a directory of records
 * and the only compression a real export uses is DEFLATE, which the platform
 * already implements — so a reader is a hundred lines rather than a supply-chain
 * decision, and this package keeps the boundary it has.
 *
 * Containment is checked on the entry names INSIDE the archive as well as on
 * the archive's own path. That is the whole reason this file exists rather than
 * a shell-out: an archive carries attacker-controlled paths, and `../` inside
 * one is the oldest bug in the format.
 */

import { inflateRawSync } from 'node:zlib';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import type { DesignSourceFetcher } from '../visual/source-fetcher.js';

export class ArchiveUnreadableError extends Error {}
export class ArchiveEntryOutsideError extends Error {}
/** An entry the expansion refuses on safety grounds rather than corruption. */
export class ArchiveEntryRefusedError extends Error {}

/**
 * Bounds on what an expansion may produce (T-020).
 *
 * Traversal was guarded from the start; these two were not, and an expansion
 * of somebody else's archive needs all three. A symlink entry can point
 * anywhere this process can write, so honouring one hands the archive a
 * capability the import never had. A decompression bomb is small on disk and
 * unbounded in memory, and the reader inflates every entry eagerly.
 */
const MAX_RATIO = 100;
const MAX_ENTRY_BYTES = 256 * 1024 * 1024;

/** Extensions treated as an archive rather than a directory. */
const ARCHIVE_SUFFIXES = ['.zip'];

export function looksLikeArchive(location: string): boolean {
  return ARCHIVE_SUFFIXES.some((s) => location.toLowerCase().endsWith(s));
}

interface Entry {
  name: string;
  body: Buffer;
}

/**
 * Read a zip's central directory and inflate each entry.
 *
 * The central directory is read rather than the local headers, because a local
 * header may declare a zero size and defer to a data descriptor — the case that
 * makes naive readers silently truncate.
 */
function readZip(buf: Buffer, label: string): Entry[] {
  // End-of-central-directory record, scanned from the back: the comment field
  // is variable-length, so its position is not fixed.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0)
    throw new ArchiveUnreadableError(`${label} is not a readable archive — no end-of-central-directory record.`);

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries: Entry[] = [];

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) {
      throw new ArchiveUnreadableError(
        `${label} is not a readable archive — corrupt central directory at entry ${i + 1}.`,
      );
    }
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    // Unix mode lives in the high 16 bits of the external attributes.
    const unixMode = (buf.readUInt32LE(p + 38) >>> 16) & 0xffff;
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue; // a directory record carries no content

    // S_IFLNK. Refused rather than followed: the target is chosen by whoever
    // built the archive, not by the project expanding it.
    if ((unixMode & 0xf000) === 0xa000) {
      throw new ArchiveEntryRefusedError(
        `${label} contains a symbolic link ("${name}"), which could point anywhere this process can write. Refusing to expand it.`,
      );
    }
    if (uncompressedSize > MAX_ENTRY_BYTES) {
      throw new ArchiveEntryRefusedError(
        `${label} contains an entry ("${name}") expanding to ${uncompressedSize} bytes, past the ${MAX_ENTRY_BYTES}-byte limit for one file.`,
      );
    }
    if (compressedSize > 0 && uncompressedSize / compressedSize > MAX_RATIO) {
      throw new ArchiveEntryRefusedError(
        `${label} contains an entry ("${name}") expanding ${Math.round(uncompressedSize / compressedSize)}× its stored size, past the ${MAX_RATIO}× limit.`,
      );
    }

    // The local header's own name/extra lengths are authoritative for where the
    // data starts; the central directory's are not the same fields.
    const lhNameLen = buf.readUInt16LE(localOffset + 26);
    const lhExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lhNameLen + lhExtraLen;
    const raw = buf.subarray(start, start + compressedSize);

    let body: Buffer;
    if (method === 0) body = Buffer.from(raw);
    else if (method === 8) body = inflateRawSync(raw);
    else throw new ArchiveUnreadableError(`${label} uses compression method ${method}, which is not supported.`);

    entries.push({ name, body });
  }
  return entries;
}

/**
 * Expand an archive into a directory and hand back the directory, so the rest
 * of the import cannot tell an archive from a folder.
 *
 * The destination is a fresh temporary directory rather than somewhere in the
 * project: expanding into the project would create exactly the material FR-003
 * says must be deletable, in a place nobody thinks to delete.
 */
export function archiveSourceFetcher(cwd: string): DesignSourceFetcher {
  return {
    async fetch(location: string): Promise<string> {
      // No containment on the ARCHIVE's own location, deliberately (FR-001):
      // a design tool drops its .zip in ~/Downloads, and every one of them was
      // routed here and rejected. What stays untouched below is the containment
      // that was ever load-bearing — per-ENTRY traversal, symlink, entry-size
      // and expansion-ratio bounds, all of which govern what somebody else's
      // archive may do to this machine rather than where the author keeps it.
      const archivePath = resolve(cwd, location);

      let buf: Buffer;
      try {
        buf = readFileSync(archivePath);
      } catch {
        throw new ArchiveUnreadableError(`${location} could not be read.`);
      }

      const entries = readZip(buf, location);
      const out = mkdtempSync(join(tmpdir(), 'spectastic-import-'));

      for (const entry of entries) {
        // An archive carries attacker-controlled paths, so containment is
        // checked per entry and not only on the archive itself.
        const normalised = normalize(entry.name);
        if (isAbsolute(normalised) || normalised.startsWith('..') || normalised.split(sep).includes('..')) {
          throw new ArchiveEntryOutsideError(
            `${location} contains an entry that escapes the archive root: ${entry.name}. Nothing was expanded.`,
          );
        }
        const target = join(out, normalised);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, entry.body);
      }

      return out;
    },
  };
}
