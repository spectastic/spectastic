import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAIProvider, resolveProviderModel } from '../src/ai-factory.js';

describe('CLI model resolution (spec 044 Tier D · FR-006/007/008)', () => {
  let dir: string;
  const saved = {
    stub: process.env.SPECTASTIC_AI_STUB,
    model: process.env.SPECTASTIC_MODEL,
    key: process.env.ANTHROPIC_API_KEY,
  };
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'spectastic-aif-'));
    delete process.env.SPECTASTIC_AI_STUB;
    delete process.env.SPECTASTIC_MODEL;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    for (const [k, v] of Object.entries({
      SPECTASTIC_AI_STUB: saved.stub,
      SPECTASTIC_MODEL: saved.model,
      ANTHROPIC_API_KEY: saved.key,
    })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('resolves the per-verb map default (implement → sonnet id)', () => {
    expect(resolveProviderModel({ verb: 'implement', cwd: dir })).toBe('claude-sonnet-5');
    expect(resolveProviderModel({ verb: 'plan', cwd: dir })).toBe('claude-sonnet-5'); // inherit → default
  });

  it('precedence: override > env > project config > map', () => {
    writeFileSync(join(dir, 'spectastic.json'), JSON.stringify({ models: { verbs: { implement: 'haiku' } } }));
    // project config beats the map
    expect(resolveProviderModel({ verb: 'implement', cwd: dir })).toBe('claude-haiku-4-5');
    // env beats project config
    process.env.SPECTASTIC_MODEL = 'opus';
    expect(resolveProviderModel({ verb: 'implement', cwd: dir })).toBe('claude-opus-4-8');
    // explicit override (the --model flag) beats env
    expect(resolveProviderModel({ verb: 'implement', override: 'sonnet', cwd: dir })).toBe('claude-sonnet-5');
  });

  it('throws fail-fast on an illegal override alias', () => {
    expect(() => resolveProviderModel({ verb: 'plan', override: 'gpt-4', cwd: dir })).toThrow(/not a legal tier alias/);
  });

  it('the resolved model reaches ClaudeProvider.model (the Assisted-by source)', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-dummy'; // constructor stores it; no network for .model
    const ai = await createAIProvider({
      verb: 'implement',
      override: 'opus',
      cwd: dir,
    });
    expect(ai.model).toBe('claude-opus-4-8');
  });

  it('the stub ignores the model (CI posture, NFR-002)', async () => {
    const stubPath = join(dir, 'stub.json');
    writeFileSync(stubPath, JSON.stringify({ chat: [], ask: [], subagent: [] }));
    process.env.SPECTASTIC_AI_STUB = stubPath;
    const ai = await createAIProvider({
      verb: 'implement',
      override: 'opus',
      cwd: dir,
    });
    expect(ai.model).toBe('stub-model');
  });
});
