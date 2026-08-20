import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * A structural guard for NFR-001 and NFR-002 (108-success-criteria, T-106).
 *
 * The six gating rules gate a commit, and a gate that needs a network or a
 * key is one that fails closed on a plane. Checked at the source-text level,
 * the same shape as 106's own render.no-comparison.test.ts — meant to fail
 * loudly if someone later reaches for a model client or a filesystem call,
 * not to be a sophisticated static analyzer.
 */

const RULE_SOURCES = [
  'criterion-actor',
  'criterion-observable',
  'criterion-single',
  'criterion-indicative',
  'criterion-validates',
  'criterion-threshold-justified',
].map((name) => [name, new URL(`../src/rules/${name}.ts`, import.meta.url)] as const);

describe('the six gating rules — 0 model calls, 0 filesystem reads (NFR-001, NFR-002)', () => {
  it('imports nothing that reaches a model or the network', () => {
    for (const [name, url] of RULE_SOURCES) {
      const source = readFileSync(url, 'utf8');
      expect(source, name).not.toMatch(/\bfetch\(|node:https?|node:net\b|AIProvider|\.subagent\(|\.chat\(/i);
    }
  });

  it('imports no filesystem module and calls no fs read', () => {
    for (const [name, url] of RULE_SOURCES) {
      const source = readFileSync(url, 'utf8');
      expect(source, name).not.toMatch(/node:fs|readFile|readFileSync|\bfs\./);
    }
  });

  it('is a PerFileRule, not a cross-file scan — no FileSystem or cwd parameter', () => {
    for (const [name, url] of RULE_SOURCES) {
      const source = readFileSync(url, 'utf8');
      expect(source, name).toContain("scope: 'per-file'");
      expect(source, name).not.toMatch(/FileSystem|cwd:/);
    }
  });
});
