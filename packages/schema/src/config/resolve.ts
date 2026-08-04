/**
 * Reading and resolving the configuration (spec 086, FR-004 / NFR-001 / D-003).
 *
 * One read of the file, one place that knows the defaults, and every value
 * handed back **with its origin**. The origin is the part that is new: sixteen
 * inline fallbacks each discarded it, which is why "where did this setting come
 * from" has been unanswerable. Carrying it now is what makes the deferred
 * `config` command a formatting exercise rather than a re-derivation.
 *
 * Fails safe, always. Absent file, unreadable file, malformed JSON, a section
 * that is not an object — every one of those yields defaults rather than an
 * exception (NFR-001). That is not politeness: several of these defaults are
 * security-relevant and fail *closed* (command execution off, git automation
 * off), so a resolver that threw would break the tool at exactly the moment the
 * safe answer mattered most.
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

/** The raw parsed file, or `{}` when there is nothing usable to read. */
export function readConfigFile(cwd: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(cwd, 'spectastic.json'), 'utf8'));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    // Absent, unreadable, or malformed. All three mean "the project said
    // nothing", which is the safe reading (NFR-001).
    return {};
  }
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
