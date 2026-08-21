import { deflateRawSync } from 'node:zlib';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ArchiveEntryOutsideError,
  ArchiveUnreadableError,
  archiveSourceFetcher,
  looksLikeArchive,
} from '../src/providers/archive-source-fetcher.js';

/**
 * An archive as an import source (105, FR-013).
 *
 * Zips are built here rather than committed as binary fixtures, so a reader can
 * see exactly what shape is being tested — including the malicious one, which is
 * the only way to know the containment check runs at all.
 */

function zip(entries: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(entries)) {
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = Buffer.from(content, 'utf8');
    const deflated = deflateRawSync(raw);
    let crc = ~0;
    for (const byte of raw) {
      crc ^= byte;
      for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    crc = ~crc >>> 0;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(8, 8); // DEFLATE
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(deflated.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, deflated);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(deflated.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += 30 + nameBuf.length + deflated.length;
  }

  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, eocd]);
}

function inProject(entries: Record<string, string> | Buffer): { cwd: string; name: string } {
  const cwd = mkdtempSync(join(tmpdir(), 'spectastic-archive-test-'));
  const name = 'export.zip';
  writeFileSync(join(cwd, name), Buffer.isBuffer(entries) ? entries : zip(entries));
  return { cwd, name };
}

describe('recognising an archive', () => {
  it('matches by extension, case-insensitively', () => {
    expect(looksLikeArchive('export.zip')).toBe(true);
    expect(looksLikeArchive('Export.ZIP')).toBe(true);
    expect(looksLikeArchive('design-export')).toBe(false);
  });
});

describe('expanding an archive', () => {
  it('hands back a directory carrying the same material', async () => {
    const { cwd, name } = inProject({ 'palette.css': ':root{--a:#abcdef}', 'notes.md': 'hello' });
    const dir = await archiveSourceFetcher(cwd).fetch(name);
    expect(readdirSync(dir).sort()).toEqual(['notes.md', 'palette.css']);
    expect(readFileSync(join(dir, 'palette.css'), 'utf8')).toBe(':root{--a:#abcdef}');
  });

  it('expands outside the project, so it never creates material FR-003 asks to be deletable', async () => {
    const { cwd, name } = inProject({ 'a.css': 'x' });
    const dir = await archiveSourceFetcher(cwd).fetch(name);
    expect(dir.startsWith(cwd)).toBe(false);
  });

  it('preserves a nested layout', async () => {
    const { cwd, name } = inProject({ 'tokens/colour.css': 'x' });
    const dir = await archiveSourceFetcher(cwd).fetch(name);
    expect(readFileSync(join(dir, 'tokens/colour.css'), 'utf8')).toBe('x');
  });
});

describe('an archive carries attacker-controlled paths', () => {
  it('refuses an entry that escapes the archive root, and expands nothing', async () => {
    const { cwd, name } = inProject({ '../escaped.css': 'x' });
    await expect(archiveSourceFetcher(cwd).fetch(name)).rejects.toBeInstanceOf(ArchiveEntryOutsideError);
  });

  it('refuses an absolute entry', async () => {
    const { cwd, name } = inProject({ '/etc/passwd': 'x' });
    await expect(archiveSourceFetcher(cwd).fetch(name)).rejects.toBeInstanceOf(ArchiveEntryOutsideError);
  });

  it('refuses a traversal buried inside a path', async () => {
    const { cwd, name } = inProject({ 'tokens/../../escaped.css': 'x' });
    await expect(archiveSourceFetcher(cwd).fetch(name)).rejects.toBeInstanceOf(ArchiveEntryOutsideError);
  });

  it('applies the same containment to the archive itself as a folder source does', async () => {
    const { cwd } = inProject({ 'a.css': 'x' });
    await expect(archiveSourceFetcher(cwd).fetch('/tmp/elsewhere.zip')).rejects.toBeInstanceOf(
      ArchiveEntryOutsideError,
    );
    await expect(archiveSourceFetcher(cwd).fetch('../elsewhere.zip')).rejects.toBeInstanceOf(ArchiveEntryOutsideError);
  });
});

describe('an archive that cannot be read', () => {
  it('names the file rather than failing obscurely', async () => {
    const { cwd, name } = inProject(Buffer.from('not a zip at all'));
    await expect(archiveSourceFetcher(cwd).fetch(name)).rejects.toThrow(/export\.zip/);
    await expect(archiveSourceFetcher(cwd).fetch(name)).rejects.toBeInstanceOf(ArchiveUnreadableError);
  });

  it('reports a missing archive rather than throwing a filesystem error', async () => {
    const { cwd } = inProject({ 'a.css': 'x' });
    await expect(archiveSourceFetcher(cwd).fetch('absent.zip')).rejects.toBeInstanceOf(ArchiveUnreadableError);
  });
});
