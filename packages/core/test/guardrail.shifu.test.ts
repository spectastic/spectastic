import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { shifuQuestions } from '../src/guardrail/shifu.js';
import type { Verdict } from '../src/guardrail/types.js';

/**
 * Slice 5 shifu (spec 117, FR-001/FR-004/NFR-001, SC-001/SC-003). Tests-first.
 */

const verdict = (over: Partial<Verdict['violations'][number]>): Verdict => ({
  at: '2026-09-13T00:00:00.000Z',
  scope: 'repo-local',
  decisionsEvaluated: 1,
  changed: ['src/recon/Job.java'],
  violations: [
    {
      decisionId: 'D-007',
      specId: '002-downstream',
      ruleId: 'no_direct_positions_write',
      reason: 'every position change must emit PositionChanged so the audit hooks fire',
      file: 'src/recon/Job.java',
      detector: 'content',
      source: 'src/recon/Job.java',
      target: 'UPDATE\\s+positions',
      ...over,
    },
  ],
});

describe('shifuQuestions (SC-001)', () => {
  it('returns one question per violation, ending in "?", naming the reason', () => {
    const qs = shifuQuestions(verdict({}));
    expect(qs.length).toBe(1);
    expect(qs[0]!.endsWith('?')).toBe(true);
    expect(qs[0]).toMatch(/PositionChanged/);
    expect(qs[0]).toMatch(/002-downstream\/D-007/);
  });

  it('is a question, not a fix — no second-person directive', () => {
    const q = shifuQuestions(verdict({}))[0]!;
    expect(q).toMatch(/^Decision .*What makes/s);
    expect(q).not.toMatch(/\byou should\b|\binstead do\b|\breplace .* with\b|\buse .* instead\b|\bchange .* to\b/i);
  });

  it('falls back to a reason-only question when source→target is absent (FR-004)', () => {
    const q = shifuQuestions(verdict({ source: undefined, target: undefined }))[0]!;
    expect(q.endsWith('?')).toBe(true);
    expect(q).toMatch(/crossing that boundary/);
  });

  it('is deterministic (SC-003)', () => {
    expect(shifuQuestions(verdict({}))).toEqual(shifuQuestions(verdict({})));
  });

  it('a clean verdict yields no questions', () => {
    expect(shifuQuestions({ at: 'x', changed: [], violations: [] })).toEqual([]);
  });
});

describe('shifu — no model, no network (NFR-001)', () => {
  const NET = /^(node:https?|node:net|undici|axios|got|openai|ollama|@anthropic-ai\/)|\/providers\/(claude|ollama)/;
  const SPEC = /(?:from\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g;
  const here = dirname(fileURLToPath(import.meta.url));
  function walk(entry: string, seen = new Set<string>()): string[] {
    const cands = [entry, `${entry}.ts`, `${entry}.js`];
    const p = cands.find((c) => existsSync(c) && c.endsWith('.ts')) ?? cands.find(existsSync);
    if (!p || seen.has(p)) return [];
    seen.add(p);
    const src = readFileSync(p, 'utf8');
    const out = [src];
    for (const m of src.matchAll(SPEC)) if (m[1]!.startsWith('.')) out.push(...walk(resolve(dirname(p), m[1]!.replace(/\.js$/, '')), seen));
    return out;
  }
  it('imports 0 network or model-client modules', () => {
    const sources = walk(resolve(here, '..', 'src', 'guardrail', 'shifu.ts'));
    expect(sources.flatMap((s) => [...s.matchAll(SPEC)].map((m) => m[1]!)).filter((sp) => NET.test(sp))).toEqual([]);
  });
});
