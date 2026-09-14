import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * NFR-001 (spec 114, SC-003): the two gate scans carry no model client and no
 * network access — they run on the pre-commit / merge path. Checks import
 * specifiers across the transitive local graph of each scan, plus a direct
 * network-call scan. Same shape as guardrail.no-network.test.ts (113).
 */

const FORBIDDEN_SPECIFIER =
  /^(node:https?|node:net|node:dgram|node:tls|undici|axios|got|openai|ollama|@anthropic-ai\/)|\/providers\/(claude|ollama)/;
const NETWORK_CALL_RE = /\bfetch\s*\(|\bXMLHttpRequest\b/;
const SPECIFIER_RE = /(?:from\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

const specifiersIn = (src: string): string[] => [...src.matchAll(SPECIFIER_RE)].map((m) => m[1]!);

function walk(entry: string, seen = new Set<string>()): { file: string; source: string }[] {
  const candidates = [entry, `${entry}.ts`, `${entry}.js`, `${entry}/index.ts`];
  const path = candidates.find((c) => existsSync(c) && c.endsWith('.ts')) ?? candidates.find(existsSync);
  if (!path || seen.has(path)) return [];
  seen.add(path);
  const source = readFileSync(path, 'utf8');
  const out = [{ file: path, source }];
  for (const spec of specifiersIn(source)) {
    if (spec.startsWith('.')) out.push(...walk(resolve(dirname(path), spec.replace(/\.js$/, '')), seen));
  }
  return out;
}

describe('guardrail gates — no model client, no network (NFR-001 / SC-003)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const graph = [
    ...walk(resolve(here, '..', 'src', 'guardrail', 'plan-constraint.ts')),
    ...walk(resolve(here, '..', 'src', 'guardrail', 'coverage.ts')),
    ...walk(resolve(here, '..', 'src', 'guardrail', 'gated-tiers.ts')),
  ];

  it('reaches the scan modules and their local imports', () => {
    expect(graph.length).toBeGreaterThanOrEqual(3);
  });
  it('imports 0 network or model-client modules', () => {
    const offenders = graph.flatMap(({ file, source }) =>
      specifiersIn(source)
        .filter((s) => FORBIDDEN_SPECIFIER.test(s))
        .map((s) => `${file}: ${s}`),
    );
    expect(offenders).toEqual([]);
  });
  it('makes 0 direct network calls', () => {
    expect(graph.filter(({ source }) => NETWORK_CALL_RE.test(source)).map((g) => g.file)).toEqual([]);
  });
});
