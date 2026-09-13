import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * SC-003 / NFR-001 (spec 115): the verdict kernel carries no model client, no
 * network, AND no child-process/exec module — executing a foreign command
 * (an enforcer's run=) is inexpressible by construction, the strongest form of
 * the 085 guard-first lesson. Walks the transitive LOCAL import graph of the
 * verdict kernel (not the CLI, which legitimately reads git).
 */

const FORBIDDEN_SPECIFIER =
  /^(node:https?|node:net|node:dgram|node:tls|node:child_process|undici|axios|got|openai|ollama|@anthropic-ai\/|execa)|\/providers\/(claude|ollama)/;
const EXEC_CALL_RE = /\bfetch\s*\(|\bexecFileSync\b|\bexecSync\b|\bspawn\b|\bexec\s*\(/;
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

describe('verdict kernel — no model, no network, no foreign execution (NFR-001 / SC-003)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const graph = walk(resolve(here, '..', 'src', 'guardrail', 'verdict.ts'));

  it('reaches the verdict kernel and its local imports', () => {
    expect(graph.length).toBeGreaterThanOrEqual(2);
  });
  it('imports 0 network, model-client, or child-process modules', () => {
    const offenders = graph.flatMap(({ file, source }) =>
      specifiersIn(source).filter((s) => FORBIDDEN_SPECIFIER.test(s)).map((s) => `${file}: ${s}`),
    );
    expect(offenders).toEqual([]);
  });
  it('makes 0 exec/spawn/fetch calls', () => {
    expect(graph.filter(({ source }) => EXEC_CALL_RE.test(source)).map((g) => g.file)).toEqual([]);
  });
});
