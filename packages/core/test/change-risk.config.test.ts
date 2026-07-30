import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadChangeRiskConfig } from '../src/change-risk/config.js';

/**
 * Unit tests for the changeRisk config loader (spec 049 NFR-004, plan D-003).
 * Mirrors enforce.waivers.test.ts's fail-safe shape.
 */

function projectWith(json: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-changerisk-'));
  writeFileSync(join(dir, 'spectastic.json'), JSON.stringify(json), 'utf8');
  return dir;
}

describe('loadChangeRiskConfig', () => {
  it('is fail-safe: absent file, missing section, malformed section → {}', () => {
    expect(loadChangeRiskConfig(mkdtempSync(join(tmpdir(), 'empty-')))).toEqual({});
    expect(loadChangeRiskConfig(projectWith({ git: { auto: 'off' } }))).toEqual({});
    expect(loadChangeRiskConfig(projectWith({ changeRisk: 'nope' }))).toEqual({});
    expect(loadChangeRiskConfig(projectWith({ changeRisk: null }))).toEqual({});
    expect(loadChangeRiskConfig(projectWith({ changeRisk: [] }))).toEqual({});
  });

  it('is fail-safe on invalid JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spectastic-badjson-'));
    writeFileSync(join(dir, 'spectastic.json'), '{ not json', 'utf8');
    expect(loadChangeRiskConfig(dir)).toEqual({});
  });

  it('loads a well-formed bands + failAt section', () => {
    const dir = projectWith({
      changeRisk: { bands: { amber: 30, red: 70 }, failAt: 70 },
    });
    expect(loadChangeRiskConfig(dir)).toEqual({
      bands: { amber: 30, red: 70 },
      failAt: 70,
    });
  });

  it('accepts bands-only or failAt-only — the two fields load independently', () => {
    const bandsOnly = projectWith({
      changeRisk: { bands: { amber: 20, red: 50 } },
    });
    expect(loadChangeRiskConfig(bandsOnly)).toEqual({
      bands: { amber: 20, red: 50 },
    });

    const failAtOnly = projectWith({ changeRisk: { failAt: 60 } });
    expect(loadChangeRiskConfig(failAtOnly)).toEqual({ failAt: 60 });
  });

  it('drops a malformed bands object but keeps a valid failAt alongside it', () => {
    const dir = projectWith({
      changeRisk: { bands: { amber: 'high', red: 70 }, failAt: 55 },
    });
    expect(loadChangeRiskConfig(dir)).toEqual({ failAt: 55 });
  });

  it('drops bands where amber does not precede red', () => {
    expect(loadChangeRiskConfig(projectWith({ changeRisk: { bands: { amber: 80, red: 20 } } }))).toEqual({});
    expect(loadChangeRiskConfig(projectWith({ changeRisk: { bands: { amber: 50, red: 50 } } }))).toEqual({});
  });

  it('drops a non-numeric or out-of-range failAt', () => {
    expect(loadChangeRiskConfig(projectWith({ changeRisk: { failAt: 'high' } }))).toEqual({});
    expect(loadChangeRiskConfig(projectWith({ changeRisk: { failAt: -1 } }))).toEqual({});
    expect(loadChangeRiskConfig(projectWith({ changeRisk: { failAt: 101 } }))).toEqual({});
    expect(loadChangeRiskConfig(projectWith({ changeRisk: { failAt: Number.NaN } }))).toEqual({});
  });
});
