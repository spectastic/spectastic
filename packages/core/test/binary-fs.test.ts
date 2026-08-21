import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nodeFs } from '../src/providers/node-fs.js';

/**
 * A byte survives the port (106-visual-render, US2 / T-200).
 *
 * FR-001/SC-001's literal acceptance: writeBinary/readBinary round-trip real
 * bytes byte-identical, including bytes a text/UTF-8 path would mangle. Real
 * temp dir + the real nodeFs provider — the whole point is verifying the
 * actual byte path, not a stub's in-memory Map.
 *
 * writeBinary/readBinary don't exist on FileSystem yet (T-210 adds them to
 * types.ts + node-fs.ts after this task lands); this file is expected to
 * fail to type-check/run until then — that's the correct red state.
 */
describe('a byte survives the port', () => {
  it('round-trips a real PNG byte-for-byte, including bytes outside the text-representable range', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'spectastic-binary-fs-'));
    const path = join(dir, 'artboard.png');

    // PNG magic bytes + arbitrary payload bytes, including >= 0x80.
    const png = new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a, // PNG signature
      0x00,
      0x00,
      0x00,
      0x0d, // chunk length (arbitrary)
      0xff,
      0xfe,
      0x80,
      0x81,
      0x7f,
      0x01,
      0x00,
      0xde,
      0xad,
      0xbe,
      0xef,
    ]);

    await nodeFs.writeBinary(path, png);
    const readBack = await nodeFs.readBinary(path);

    expect(readBack.length).toBe(png.length);
    expect(Array.from(readBack)).toEqual(Array.from(png));
  });

  it('round-trips a byte sequence that is invalid UTF-8 and would be mangled by a text path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'spectastic-binary-fs-'));
    const path = join(dir, 'invalid-utf8.bin');

    // 0xFF and 0xFE are never valid anywhere in a UTF-8 byte stream; a lone
    // 0x80 continuation byte with no preceding leading byte is invalid too.
    // A text/UTF-8 read-then-write path replaces each with U+FFFD, which
    // corrupts the byte count and the byte values — this must not happen.
    const invalidUtf8 = new Uint8Array([0xff, 0xfe, 0x80, 0x41, 0xc0, 0xc1, 0xed, 0xa0, 0x80]);

    await nodeFs.writeBinary(path, invalidUtf8);
    const readBack = await nodeFs.readBinary(path);

    expect(readBack.length).toBe(invalidUtf8.length);
    expect(Array.from(readBack)).toEqual(Array.from(invalidUtf8));
  });
});
