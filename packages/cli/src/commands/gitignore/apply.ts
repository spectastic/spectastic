import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Sentinel-block .gitignore merge (spec 043, D-002).
 *
 * All spectastic-managed entries live between two markers. The block is
 * spectastic's — marked "managed" — and merges are a set-union INTO it,
 * additive across callers (init writes the base; `spectastic gitignore --stack`
 * grows it). Everything OUTSIDE the block is the user's and is preserved
 * byte-for-byte (FR-004). Re-running with the same entries is a no-op (NFR-002).
 */

export const BLOCK_START = '# >>> spectastic (managed — do not edit inside; put your own rules outside) >>>';
export const BLOCK_END = '# <<< spectastic <<<';

/** Escape a string for use in a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const BLOCK_RE = new RegExp(`${escapeRe(BLOCK_START)}\\n([\\s\\S]*?)\\n?${escapeRe(BLOCK_END)}`);

function renderBlock(entries: readonly string[]): string {
  return `${BLOCK_START}\n${entries.join('\n')}\n${BLOCK_END}`;
}

/** Non-empty, non-comment lines of an existing block body, in order. */
function parseBlockEntries(body: string): string[] {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

/**
 * Pure merge: return `existing` .gitignore content with the spectastic block
 * containing the union of (its current entries ∪ `entries`), everything else
 * untouched. A missing block is appended at EOF; a missing file starts empty.
 * Idempotent: merging the same entries again yields byte-identical output.
 */
export function mergeBlock(existing: string, entries: readonly string[]): string {
  const match = BLOCK_RE.exec(existing);
  const current = match ? parseBlockEntries(match[1] ?? '') : [];

  const merged: string[] = [];
  const seen = new Set<string>();
  for (const e of [...current, ...entries]) {
    if (seen.has(e)) continue;
    seen.add(e);
    merged.push(e);
  }

  const block = renderBlock(merged);
  if (match) {
    return existing.replace(BLOCK_RE, block);
  }
  // No block yet — append, with exactly one blank line before it.
  if (existing.trim() === '') return `${block}\n`;
  const base = existing.endsWith('\n') ? existing : `${existing}\n`;
  return `${base}\n${block}\n`;
}

/**
 * Apply the spectastic ignore block to `<cwd>/.gitignore`, merging the given
 * entries. Returns true if the file changed (false when already current —
 * idempotent). Deterministic, filesystem-only (NFR-001).
 */
export async function applyGitignore(cwd: string, entries: readonly string[]): Promise<boolean> {
  const path = join(cwd, '.gitignore');
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const next = mergeBlock(existing, entries);
  if (next === existing) return false;
  await writeFile(path, next, 'utf8');
  return true;
}
