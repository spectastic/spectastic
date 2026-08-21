import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ArchiveEntryRefusedError,
  archiveSourceFetcher,
  looksLikeArchive,
} from '../src/providers/archive-source-fetcher.js';

/**
 * The expansion bounds (105-design-source-import, T-020).
 *
 * FR-013's archive expansion was already built — the card that asked for it
 * was wrong, because it searched `visual/` and the provider lives in
 * `providers/`. What was genuinely missing is two of the three refusals: a
 * symlink entry and a decompression bomb were both expanded happily.
 *
 * Built against archives the system `zip` produces, not hand-rolled bytes: a
 * fixture written by the same hand as the reader can agree with it while both
 * disagree with what a designer actually hands the importer.
 */
/**
 * Build an archive and return the project root it sits in, plus its
 * project-relative name. The fetcher refuses a location outside the project,
 * so the archive has to live inside the root it is given.
 */
function zipOf(build: (dir: string) => void, args: string[] = []): { root: string; rel: string } {
  const root = mkdtempSync(join(tmpdir(), 'spectastic-archive-'));
  const src = join(root, 'src');
  mkdirSync(src, { recursive: true });
  build(src);
  execFileSync('zip', ['-qr', ...args, join(root, 'export.zip'), '.'], { cwd: src });
  return { root, rel: 'export.zip' };
}

describe('a real export still expands', () => {
  it('round-trips text and binary content through the fetcher', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x7f]);
    const { root, rel } = zipOf((d) => {
      writeFileSync(join(d, 'Screens.dc.html'), '<html>hello</html>\n');
      mkdirSync(join(d, 'assets'));
      writeFileSync(join(d, 'assets', 'thumb.png'), png);
    });
    const dir = await archiveSourceFetcher(root).fetch(rel);
    expect(readFileSync(join(dir, 'Screens.dc.html'), 'utf8')).toBe('<html>hello</html>\n');
    // The byte path is the whole point — a PNG through a text read is mangled
    // silently, which is what made the first design import land nothing.
    expect(readFileSync(join(dir, 'assets', 'thumb.png')).equals(png)).toBe(true);
  });
});

describe('the bounds T-020 added', () => {
  it('refuses a symlink entry rather than following it', async () => {
    const { root, rel } = zipOf(
      (d) => {
        writeFileSync(join(d, 'real.txt'), 'x');
        symlinkSync('/etc/passwd', join(d, 'escape'));
      },
      ['--symlinks'],
    );
    await expect(archiveSourceFetcher(root).fetch(rel)).rejects.toThrow(ArchiveEntryRefusedError);
  });

  it('refuses an entry that expands far past its stored size', async () => {
    const { root, rel } = zipOf((d) => writeFileSync(join(d, 'bomb.txt'), 'a'.repeat(2_000_000)));
    await expect(archiveSourceFetcher(root).fetch(rel)).rejects.toThrow(/× its stored size/);
  });

  it('names the entry it refused, so a person can look at it', async () => {
    const { root, rel } = zipOf((d) => writeFileSync(join(d, 'bomb.txt'), 'a'.repeat(2_000_000)));
    await expect(archiveSourceFetcher(root).fetch(rel)).rejects.toThrow(/bomb\.txt/);
  });
});

describe('looksLikeArchive', () => {
  it('recognises a zip by suffix and nothing else', () => {
    expect(looksLikeArchive('export.zip')).toBe(true);
    expect(looksLikeArchive('exported-folder')).toBe(false);
  });
});
