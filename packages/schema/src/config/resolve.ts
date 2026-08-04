/**
 * Reading and resolving the configuration (spec 086, FR-004 / NFR-001 / D-003).
 *
 * One read of the file, one place that knows the defaults, and every value
 * handed back **with its origin**. The origin is the part that is new: sixteen
 * inline fallbacks each discarded it, which is why "where did this setting come
 * from" has been unanswerable. Carrying it now is what makes the deferred
 * `config` command a formatting exercise rather than a re-derivation.
 *
 * Fails safe by default. An absent file, an unreadable one, or a section that
 * is not an object yields defaults rather than an exception (NFR-001) — not
 * politeness: several of these defaults are security-relevant and fail *closed*
 * (command execution off, git automation off), so a resolver that threw would
 * break the tool exactly when the safe answer mattered most.
 *
 * Malformed JSON is the one case with two answers, because the readers
 * genuinely disagreed and both were right for their own callers. See
 * `MalformedPolicy` — surfacing that disagreement in one place, rather than
 * leaving it implicit across sixteen private opinions, is a large part of what
 * this module is for.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONFIG_REGISTRY,
  NO_DEFAULT,
  type KeyDescriptor,
  type SectionDescriptor,
  type SectionName,
} from './registry.js';

/** Where a value came from. */
export type Origin = 'file' | 'default' | 'unset';

export interface ResolvedValue<T = unknown> {
  value: T | undefined;
  /**
   * `file` — the project said so. `default` — the registry did. `unset` — the
   * project said nothing and there is no default, so the caller must cope.
   *
   * `file` is reported even when the written value equals the default, so a
   * user can be told the difference between "explicitly set to this" and "left
   * alone". Collapsing the two would lose a real distinction.
   */
  origin: Origin;
}

/**
 * What to do when the file exists but is not valid JSON.
 *
 * Two policies, because the readers had divided this labour between them —
 * implicitly (086 FR-005). Some raise a loud error on a malformed file (git,
 * models, decider, corpus); the rest fall back to defaults, and the enforce
 * reader says why in as many words: *"the git config reader owns the loud error
 * for that."*
 *
 * So they were never in conflict. They were coordinating, on an assumption
 * nothing recorded and nothing checks — that a loud reader always runs first.
 * That holds today and would fail silently the moment a command resolved only
 * enforcement, at which point a typo'd file would take effect as defaults with
 * no complaint.
 *
 * Making the division a named argument does not fix the assumption. It does put
 * it somewhere a reader can see it, instead of leaving it distributed across
 * sixteen private opinions where comparing them required reading all sixteen.
 */
export type MalformedPolicy = 'default' | 'throw';

/** Thrown only when a caller asked for `throw` and the file is unparseable. */
export class ConfigParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigParseError';
  }
}

/**
 * Parse configuration text that a caller already has.
 *
 * Exists because two legitimate callers cannot use the filesystem reader and
 * should still not hand-roll the parse (086 FR-004): the contract notifier
 * takes its IO as an injected port, so reaching for `readFileSync` here would
 * break the seam it is built on; and the config *writer* does read-modify-write
 * and needs the original text to preserve a user's formatting.
 *
 * Same policy semantics as `readConfigFile`, so the two cannot drift on what a
 * malformed file means.
 */
export function parseConfigText(raw: string, onMalformed: MalformedPolicy = 'default'): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch (err) {
    if (onMalformed === 'throw') {
      throw new ConfigParseError(`spectastic.json is not valid JSON — ${(err as Error).message}`);
    }
    return {};
  }
}

/** The raw parsed file, or `{}` when there is nothing usable to read. */
export function readConfigFile(cwd: string, onMalformed: MalformedPolicy = 'default'): Record<string, unknown> {
  let raw: string;
  try {
    raw = readFileSync(join(cwd, 'spectastic.json'), 'utf8');
  } catch {
    // Absent or unreadable means "the project said nothing" under both
    // policies — there is no typo to report.
    return {};
  }

  // Delegates, so there is exactly one place in the repository that turns
  // configuration text into an object.
  return parseConfigText(raw, onMalformed);
}

function resolveOne(raw: unknown, descriptor: KeyDescriptor): ResolvedValue {
  if (raw !== undefined) return { value: raw, origin: 'file' };
  if (descriptor.default === NO_DEFAULT) return { value: undefined, origin: 'unset' };
  return { value: descriptor.default, origin: 'default' };
}

/** One section's resolved values, keyed as the registry declares them. */
export type ResolvedSection = Record<string, ResolvedValue>;

/**
 * Resolve every declared key against a file.
 *
 * Takes the already-parsed object rather than a path so the resolution is pure
 * and testable without a filesystem — the same ports split the rest of the
 * kernel uses.
 */
export function resolveConfig(file: Record<string, unknown>): Record<SectionName, ResolvedSection> {
  const out = {} as Record<SectionName, ResolvedSection>;

  for (const name of Object.keys(CONFIG_REGISTRY) as SectionName[]) {
    const descriptors: SectionDescriptor = CONFIG_REGISTRY[name];
    const section: ResolvedSection = {};

    // `consumes` is a top-level scalar modelled as a one-key section so the
    // walk stays uniform; its value is read from the root rather than nested.
    const rawSection = name in descriptors ? file : file[name];
    const bag =
      typeof rawSection === 'object' && rawSection !== null && !Array.isArray(rawSection)
        ? (rawSection as Record<string, unknown>)
        : {};

    for (const [key, descriptor] of Object.entries(descriptors)) {
      section[key] = resolveOne(bag[key], descriptor);
    }
    out[name] = section;
  }

  return out;
}

/** Read and resolve in one step — what most callers want. */
export function loadConfig(cwd: string): Record<SectionName, ResolvedSection> {
  return resolveConfig(readConfigFile(cwd));
}

/**
 * The value alone, for the common case that does not care where it came from.
 *
 * Keeps D-003's richer return type from being a tax on every consumer: a reader
 * that just wants the number asks for the number.
 */
export function configValue<T = unknown>(cwd: string, section: SectionName, key: string): T | undefined {
  return loadConfig(cwd)[section]?.[key]?.value as T | undefined;
}
