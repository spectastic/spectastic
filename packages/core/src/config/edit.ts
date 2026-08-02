/**
 * The shared `spectastic.json` editor (spec 080-unit-edge-authoring, D-001/D-003).
 *
 * One parse-mutate-write path behind two named policies, because three callers
 * were about to carry three copies of the same dance and their semantics
 * genuinely differ:
 *
 *   setIfAbsent — writes only when the key is missing, never overwriting an
 *                 owner's value. `init`'s behaviour, preserved exactly.
 *   addToSet    — appends a member idempotently, so re-running is a no-op.
 *
 * Keeping them separate is the point: `init` must never receive an append.
 *
 * Every refusal is decided before a byte is written (D-002), so a refused edit
 * leaves the file byte-identical without a temp file or a cleanup path. An
 * unparseable config is refused rather than overwritten — clobbering it is the
 * one failure that would destroy work.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CONFIG_FILE = 'spectastic.json';
const DEFAULT_INDENT = '  ';

/**
 * The indentation the file already uses, from its first indented line.
 *
 * Re-emitting parsed JSON normalises whitespace, which is invisible in a
 * 2-space project and rewrites every line of a tab-indented one. A heuristic
 * rather than a guarantee: an unusual first line yields a reasonable guess, and
 * the fallback is the previous behaviour, so this can only improve on it.
 */
function detectIndent(raw: string): string {
  const match = /\n([ \t]+)\S/.exec(raw);
  return match?.[1] ?? DEFAULT_INDENT;
}

interface LoadedConfig {
  data: Record<string, unknown>;
  indent: string;
  /** Raw bytes when the file exists — absent means "no file yet", not "empty". */
  raw: string | null;
}

/** Read and parse; `null` when the file exists but will not parse (never clobber). */
function load(cwd: string): LoadedConfig | null {
  const path = join(cwd, CONFIG_FILE);
  if (!existsSync(path)) return { data: {}, indent: DEFAULT_INDENT, raw: null };
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return { data: parsed as Record<string, unknown>, indent: detectIndent(raw), raw };
  } catch {
    return null;
  }
}

/** The single write. Reached only once every refusal has been ruled out. */
function persist(cwd: string, config: LoadedConfig): boolean {
  try {
    writeFileSync(join(cwd, CONFIG_FILE), `${JSON.stringify(config.data, null, config.indent)}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Set `key` only when it is absent. Returns whether anything was written, so a
 * caller can report accurately rather than guessing (the shape `init`'s
 * existing writers already return).
 */
export function setIfAbsent(cwd: string, key: string, value: unknown): boolean {
  const config = load(cwd);
  if (config === null) return false; // unparseable — refuse, never overwrite
  if (config.data[key] !== undefined) return false; // already set — never clobber
  config.data[key] = value;
  return persist(cwd, config);
}

/**
 * Add `member` to the array at `key`, creating the array when absent. A member
 * already present is a no-op — which is what makes re-running the write verb
 * safe rather than duplicating.
 *
 * A non-array value already at the key is left alone: overwriting it would
 * destroy a value the owner set, and this editor never does that.
 */
export function addToSet(cwd: string, key: string, member: string): boolean {
  const config = load(cwd);
  if (config === null) return false;
  const existing = config.data[key];
  if (existing !== undefined && !Array.isArray(existing)) return false;
  const members = Array.isArray(existing) ? existing : [];
  if (members.includes(member)) return false; // idempotent
  config.data[key] = [...members, member];
  return persist(cwd, config);
}
