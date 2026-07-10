import { describe, it, expect } from 'vitest';
import {
  MODEL_TIER_ALIASES,
  ALIAS_TO_MODEL_ID,
  DEFAULT_MODEL_ID,
  VERB_MODEL_POLICY,
  isModelTier,
  tierToModelId,
  resolveVerbModel,
} from '../src/model-policy/index.js';

describe('model-policy (spec 044)', () => {
  it('legal aliases and their concrete ids (never date-suffixed)', () => {
    expect([...MODEL_TIER_ALIASES]).toEqual(['opus', 'sonnet', 'haiku', 'inherit']);
    expect(ALIAS_TO_MODEL_ID).toEqual({
      opus: 'claude-opus-4-8',
      sonnet: 'claude-sonnet-5',
      haiku: 'claude-haiku-4-5',
    });
    // Refreshed default (the stale claude-sonnet-4-6 is gone) sourced from the one table.
    expect(DEFAULT_MODEL_ID).toBe('claude-sonnet-5');
  });

  it('per-verb policy: implement/apply/tasks downgrade, the rest inherit', () => {
    expect(VERB_MODEL_POLICY.implement).toBe('sonnet');
    expect(VERB_MODEL_POLICY.apply).toBe('sonnet');
    expect(VERB_MODEL_POLICY.tasks).toBe('sonnet');
    for (const v of ['spec', 'plan', 'propose', 'triage', 'explain', 'principles', 'explore']) {
      expect(VERB_MODEL_POLICY[v]).toBe('inherit');
    }
  });

  it('isModelTier accepts legal aliases, rejects everything else', () => {
    expect(isModelTier('sonnet')).toBe(true);
    expect(isModelTier('inherit')).toBe(true);
    expect(isModelTier('sonet')).toBe(false); // the typo the drift-guard must catch
    expect(isModelTier('claude-sonnet-5')).toBe(false); // a pinned id is not a legal alias
    expect(isModelTier(undefined)).toBe(false);
  });

  it('tierToModelId resolves aliases; inherit falls to the CLI default', () => {
    expect(tierToModelId('opus')).toBe('claude-opus-4-8');
    expect(tierToModelId('sonnet')).toBe('claude-sonnet-5');
    expect(tierToModelId('inherit')).toBe(DEFAULT_MODEL_ID);
  });

  it('resolveVerbModel honours override > project > map > default precedence', () => {
    // map default for implement is sonnet
    expect(resolveVerbModel('implement')).toBe('claude-sonnet-5');
    // project config overrides the map
    expect(resolveVerbModel('implement', undefined, 'haiku')).toBe('claude-haiku-4-5');
    // per-run override wins over everything (the --model opus escape hatch shape)
    expect(resolveVerbModel('implement', 'opus', 'haiku')).toBe('claude-opus-4-8');
    // an inherit verb with no override → the CLI default
    expect(resolveVerbModel('plan')).toBe(DEFAULT_MODEL_ID);
    // an unregistered verb → inherit → default
    expect(resolveVerbModel('nonesuch')).toBe(DEFAULT_MODEL_ID);
  });
});
