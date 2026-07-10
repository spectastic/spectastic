import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadModelsConfig, ModelsConfigError } from '../src/config/models.js';

describe('loadModelsConfig (spec 044 D-003)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spectastic-models-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const write = (obj: unknown) => writeFileSync(join(dir, 'spectastic.json'), JSON.stringify(obj));

  it('returns empty when no file / no models section', () => {
    expect(loadModelsConfig(dir)).toEqual({});
    write({ decider: { role: 'human' } });
    expect(loadModelsConfig(dir)).toEqual({});
  });

  it('reads a valid default + per-verb map', () => {
    write({ models: { default: 'haiku', verbs: { plan: 'opus', implement: 'sonnet' } } });
    expect(loadModelsConfig(dir)).toEqual({
      default: 'haiku',
      verbs: { plan: 'opus', implement: 'sonnet' },
    });
  });

  it('throws on an illegal default alias (fail-fast)', () => {
    write({ models: { default: 'sonet' } });
    expect(() => loadModelsConfig(dir)).toThrow(ModelsConfigError);
  });

  it('throws on an illegal per-verb alias', () => {
    write({ models: { verbs: { plan: 'claude-opus-4-8' } } });
    expect(() => loadModelsConfig(dir)).toThrow(/models\.verbs\.plan/);
  });

  it('throws on malformed JSON', () => {
    writeFileSync(join(dir, 'spectastic.json'), '{ not json');
    expect(() => loadModelsConfig(dir)).toThrow(ModelsConfigError);
  });
});
