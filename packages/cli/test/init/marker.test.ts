import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readMarker, writeMarker } from '../../src/commands/init/marker.js';

/** Unit tests for the profile marker (spec 041 T-013 / FR-009). */

describe('marker: read/write roundtrip', () => {
  it('writes .spectastic/profile.json and reads it back', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'spectastic-marker-'));
    expect(readMarker(dir)).toBeNull();
    await writeMarker(dir, 'verified');
    expect(readMarker(dir)).toEqual({ profile: 'verified', schema: 1 });
  });

  it('returns null for a malformed marker', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'spectastic-marker-bad-'));
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(join(dir, '.spectastic'), { recursive: true });
    await writeFile(join(dir, '.spectastic', 'profile.json'), '{ not json', 'utf8');
    expect(readMarker(dir)).toBeNull();
  });
});
