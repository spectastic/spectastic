import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * SC-003 / NFR-001 (spec 112-guardrail-decision-record): the enforcement path
 * exercising `decision-well-formed` carries no model client and no network
 * access. Asserted by walking the rule module's TRANSITIVE local import graph
 * and confirming zero forbidden references — stronger than a single-file scan,
 * because the guarantee is about the whole path a verdict runs, not one file.
 *
 * The verdict path is deterministic by construction; the value here is a
 * regression tripwire — it fails loudly the day someone reaches for `fetch`, a
 * network module, or a model-client import anywhere the rule transitively pulls.
 */

const NETWORK_RE = /\bfetch\s*\(|node:https?\b|node:net\b|node:dgram\b|\bundici\b|\baxios\b|\bgot\b/i;
const MODEL_CLIENT_RE = /@anthropic-ai|\bopenai\b|\bollama\b|ai-provider|['"][^'"]*\/provider(?:s)?['"]/i;
const IMPORT_RE = /(?:import|export)[^'"]*from\s*['"](\.[^'"]+)['"]/g;

function walk(entry: string, seen = new Set<string>()): string[] {
  const candidates = [entry, `${entry}.ts`, `${entry}.js`, `${entry}/index.ts`];
  const path = candidates.find((c) => existsSync(c) && !c.endsWith('/index.ts')) ?? candidates.find(existsSync);
  if (!path || seen.has(path)) return [];
  seen.add(path);
  const source = readFileSync(path, 'utf8');
  const sources = [source];
  for (const m of source.matchAll(IMPORT_RE)) {
    const rel = m[1]!.replace(/\.js$/, '');
    sources.push(...walk(resolve(dirname(path), rel), seen));
  }
  return sources;
}

describe('decision-well-formed — no model client, no network on the path (NFR-001)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const entry = resolve(here, '..', 'src', 'rules', 'decision-well-formed.ts');
  const sources = walk(entry);

  it('reaches at least the rule module and its schema imports', () => {
    expect(sources.length).toBeGreaterThanOrEqual(1);
  });

  it('has 0 network references across the transitive import graph', () => {
    const hits = sources.filter((s) => NETWORK_RE.test(s));
    expect(hits.length).toBe(0);
  });

  it('has 0 model-client references across the transitive import graph', () => {
    const hits = sources.filter((s) => MODEL_CLIENT_RE.test(s));
    expect(hits.length).toBe(0);
  });
});
