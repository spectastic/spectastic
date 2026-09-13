import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * NFR-001 (spec 112 / design brief): the retrieval path carries no model client
 * and no network access — retrieval sits on the enforcement path (the merge
 * gate calls the same function), so a model or a socket must never reach it.
 *
 * Checks IMPORT SPECIFIERS across the transitive local graph (not arbitrary
 * body text — a docstring saying "no createAIProvider()" is not a violation),
 * plus a direct `fetch(` scan for a network call made without an import. This
 * is the faithful reading of NFR-001: "the imports contain 0 model clients".
 */

const FORBIDDEN_SPECIFIER =
  /^(node:https?|node:net|node:dgram|node:tls|undici|axios|got|openai|ollama|@anthropic-ai\/)|\/providers\/(claude|ollama)/;
const NETWORK_CALL_RE = /\bfetch\s*\(|\bXMLHttpRequest\b/;
const SPECIFIER_RE = /(?:from\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

function specifiersIn(source: string): string[] {
  return [...source.matchAll(SPECIFIER_RE)].map((m) => m[1]!);
}

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

describe('guardrail retrieval — no model client, no network on the path (NFR-001)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  // The retrieval kernel + the injection block builder (116) — both must stay clean.
  const graph = [
    ...walk(resolve(here, '..', 'src', 'commands', 'adrs.ts')),
    ...walk(resolve(here, '..', 'src', 'guardrail', 'injection.ts')),
  ];

  it('reaches the kernel and its transitive local imports', () => {
    expect(graph.length).toBeGreaterThanOrEqual(3);
  });

  it('imports 0 network or model-client modules across the graph', () => {
    const offenders = graph.flatMap(({ file, source }) =>
      specifiersIn(source)
        .filter((s) => FORBIDDEN_SPECIFIER.test(s))
        .map((s) => `${file}: ${s}`),
    );
    expect(offenders).toEqual([]);
  });

  it('makes 0 direct network calls across the graph', () => {
    const offenders = graph.filter(({ source }) => NETWORK_CALL_RE.test(source)).map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});
