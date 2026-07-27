import { execFileSync } from 'node:child_process';
import type { CorpusPack } from '../knowledge/types.js';

/**
 * grep<pattern> — full-text search over corpus document bodies, never metadata (that's
 * query's job) and never embeddings (064-corpus-package-extraction, US3, FR-005, plan D-005).
 * Shells out to ripgrep when present on PATH for speed; falls back to a pure-Node scan
 * otherwise. Both paths operate on the exact same in-memory document bodies (never touching
 * disk directly — rg receives each body over stdin) with the same case-insensitive
 * fixed-string matching semantics, so their output is identical by construction, not by
 * coincidence: this is what the parity test in read.grep-parity.test.ts verifies directly.
 */
export interface GrepHit {
  id: string;
  filePath: string;
  line: number;
  context: string;
}

export interface GrepOptions {
  /** Force a specific path — for the parity test. Omit for the real auto-detect. */
  mode?: 'auto' | 'node' | 'rg';
}

let rgAvailableCache: boolean | undefined;

/** Whether `rg` resolves on PATH — cached per process, since a repeated shell-out to check
 * is wasted work on every grep call otherwise. */
export function rgAvailable(): boolean {
  if (rgAvailableCache !== undefined) return rgAvailableCache;
  try {
    execFileSync('rg', ['--version'], { stdio: 'ignore' });
    rgAvailableCache = true;
  } catch {
    rgAvailableCache = false;
  }
  return rgAvailableCache;
}

/** One line-numbered hit within a single document body — the shared shape both paths
 * produce before the caller attaches the document's id/filePath. */
interface BodyHit {
  line: number;
  context: string;
}

function nodeSearchBody(body: string, needle: string): BodyHit[] {
  const lowerNeedle = needle.toLowerCase();
  const hits: BodyHit[] = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i] ?? '';
    if (text.toLowerCase().includes(lowerNeedle)) hits.push({ line: i + 1, context: text.trim() });
  }
  return hits;
}

function rgSearchBody(body: string, needle: string): BodyHit[] {
  try {
    const out = execFileSync('rg', ['--fixed-strings', '--ignore-case', '--line-number', '--no-filename', '--', needle], {
      input: body,
      encoding: 'utf8',
    });
    return out
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        const sep = line.indexOf(':');
        return { line: Number(line.slice(0, sep)), context: line.slice(sep + 1).trim() };
      });
  } catch (err) {
    // rg exits 1 for "no match" — a normal signal, not a failure (confirmed this turn).
    const e = err as { status?: number };
    if (e.status === 1) return [];
    throw err;
  }
}

/**
 * Search every document body across every pack. `mode` forces a path for testing; omitted,
 * it auto-detects via `rgAvailable()`. Documents with no id (unmigrated/malformed) are
 * skipped — a hit with no citable coordinate isn't useful to a caller. Sorted by id then
 * line for deterministic output, matching `query`'s convention.
 */
export function grep(pattern: string, packs: readonly CorpusPack[], opts: GrepOptions = {}): GrepHit[] {
  const useRg = opts.mode === 'rg' ? true : opts.mode === 'node' ? false : rgAvailable();
  const hits: GrepHit[] = [];

  for (const pack of packs) {
    for (const doc of pack.documents) {
      if (doc.id === null) continue;
      const bodyHits = useRg ? rgSearchBody(doc.body, pattern) : nodeSearchBody(doc.body, pattern);
      for (const h of bodyHits) hits.push({ id: doc.id, filePath: doc.filePath, line: h.line, context: h.context });
    }
  }

  return hits.sort((a, b) => a.id.localeCompare(b.id) || a.line - b.line);
}
