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
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import type { DesignSourceFetcher } from '../visual/source-fetcher.js';

export class ArchiveUnreadableError extends Error {}
export class ArchiveEntryOutsideError extends Error {}

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
  if (eocd < 0) throw new ArchiveUnreadableError(`${label} is not a readable archive — no end-of-central-directory record.`);

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries: Entry[] = [];

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) {
      throw new ArchiveUnreadableError(`${label} is not a readable archive — corrupt central directory at entry ${i + 1}.`);
    }
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue; // a directory record carries no content

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
      if (isAbsolute(location)) {
        throw new ArchiveEntryOutsideError(`${location} is an absolute path; give a location inside the project.`);
      }
      const archivePath = resolve(cwd, location);
      const rel = relative(cwd, archivePath);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        throw new ArchiveEntryOutsideError(`${location} resolves outside the project.`);
      }

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
