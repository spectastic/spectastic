/**
 * The declared configuration surface (spec 086, FR-001 / FR-002 / D-002).
 *
 * Before this existed, the tool's defaults were sixteen inline `?? fallback`
 * expressions, each beside its one consumer. Nothing could enumerate them, so
 * nothing could tell a user what the tool had decided on their behalf — which
 * blocked a published schema, a `config` command, a documentation page and an
 * annotated starter all at once. This is the list those things read.
 *
 * It lives in `@spectastic/schema` and not in the kernel because
 * `@spectastic/corpus` reads the configuration too and is forbidden from
 * importing `@spectastic/core` by a CI-enforced boundary (064). The floor
 * package is the only legal home, not the preferred one (D-001).
 *
 * The registry is **authoritative**: a key absent from it is a key the tool
 * does not have. That is what makes the drift guard meaningful, and what will
 * later let a misspelt key be reported instead of silently ignored.
 */

/** How a key's value is shaped. Used by consumers that know nothing else about it. */
export type KeyType = 'string' | 'number' | 'boolean' | 'string[]' | 'object' | 'object[]';

/**
 * Marks a key that has no default at all — a project identity, a waiver list.
 *
 * A distinct sentinel rather than `undefined` (FR-002): `undefined` cannot
 * distinguish "there is no default" from "the default is undefined", and a
 * generated document would render the difference as a value the tool does not
 * actually assume.
 */
export const NO_DEFAULT = Symbol('no-default');

export interface KeyDescriptor {
  /** The value's shape. */
  type: KeyType;
  /** The default in force when the file says nothing, or NO_DEFAULT. */
  default: string | number | boolean | readonly string[] | Readonly<Record<string, unknown>> | typeof NO_DEFAULT;
  /** One line, written for a user rather than a maintainer (FR-008). */
  description: string;
}

export type SectionDescriptor = Readonly<Record<string, KeyDescriptor>>;

/**
 * Every section the tool reads, every key within it, and every default.
 *
 * Ten sections. `run` is deliberately absent: `commands/run.ts` resolves the
 * *decider* configuration, not a section of its own — an over-count the
 * discoverable-defaults survey made and this registry corrected.
 *
 * `design.stackInterview` is also deliberately absent — and is now absent from
 * the tool entirely. It was honoured only by the design command's markdown and
 * read by no package (FR-007), so 050's change 2026-08-12-withdraw-stack-interview-key
 * withdrew it rather than implementing it. Declaring it here would have made
 * this list — and every document generated from it — assert a capability that
 * did not exist.
 */
export const CONFIG_REGISTRY = Object.freeze({
  project: Object.freeze({
    project: {
      type: 'string',
      default: NO_DEFAULT,
      description:
        'This project\'s owner-qualified identity, e.g. "acme/payments". Used to build federation-unique coordinates.',
    },
  }),

  implement: Object.freeze({
    drain: {
      type: 'boolean',
      default: true,
      description:
        'Whether `implement <spec-id>` empties the queue or stops after one task. A command-line flag overrides this; the compiled default is to drain.',
    },
  }),

  git: Object.freeze({
    auto: {
      type: 'string',
      default: 'off',
      description: 'Whether verbs create branches and commits automatically: "off", "commit", or "branch+commit".',
    },
    trailers: {
      type: 'string',
      default: 'off',
      description: 'Whether commits carry an Assisted-by trailer naming the model: "on" or "off".',
    },
  }),

  models: Object.freeze({
    default: {
      type: 'string',
      default: NO_DEFAULT,
      description: 'Model tier for verbs with no specific policy: opus, sonnet, haiku or inherit.',
    },
    verbs: {
      type: 'object',
      default: NO_DEFAULT,
      description: 'Per-verb model tier overrides, keyed by verb name.',
    },
  }),

  decider: Object.freeze({
    role: {
      type: 'string',
      default: NO_DEFAULT,
      description: "Who answers a generation verb's bounded decisions during an unattended run.",
    },
    effort: {
      type: 'string',
      default: NO_DEFAULT,
      description: 'Requested reasoning effort for decider turns.',
    },
    floor: {
      type: 'string',
      default: NO_DEFAULT,
      description: 'Lowest effort level the decider may drop to.',
    },
  }),

  enforce: Object.freeze({
    waivers: {
      type: 'object[]',
      default: NO_DEFAULT,
      description: 'Per-category enforcement waivers, each with a category, reason, expiry and owner.',
    },
    unwaivable: {
      type: 'string[]',
      default: NO_DEFAULT,
      description: 'Categories that may never be waived, whatever the profile.',
    },
  }),

  validate: Object.freeze({
    quantifiedNfrFloor: {
      type: 'number',
      default: NO_DEFAULT,
      description: 'Lowest spec number the quantified-NFR check applies to; older specs predate the convention.',
    },
  }),

  verify: Object.freeze({
    executeCapturedCommands: {
      type: 'boolean',
      default: false,
      description:
        'Whether this project permits running the commands recorded in its own verify views. Off by default; never applies to an artifact from a dependency.',
    },
  }),

  corpus: Object.freeze({
    marketplace: {
      type: 'string',
      default: NO_DEFAULT,
      description:
        "Marketplace name qualifying this project's knowledge packs. Derived from the project identity when unset.",
    },
    root: {
      type: 'string',
      default: 'knowledge',
      description: 'Directory holding the knowledge corpus.',
    },
    namespace: {
      type: 'string',
      default: NO_DEFAULT,
      description: 'Deprecated read-alias for marketplace; prefer marketplace.',
    },
  }),

  consumes: Object.freeze({
    consumes: {
      type: 'string[]',
      default: NO_DEFAULT,
      description: 'Units this project declares a dependency on, as coordinates.',
    },
  }),

  changeRisk: Object.freeze({
    bands: {
      type: 'object',
      default: NO_DEFAULT,
      description: 'Score thresholds separating green, amber and red change-risk bands.',
    },
    failAt: {
      type: 'number',
      default: NO_DEFAULT,
      description: 'Change-risk score at or above which the check exits non-zero. 0-100.',
    },
  }),
} as const satisfies Readonly<Record<string, SectionDescriptor>>);

export type ConfigRegistry = typeof CONFIG_REGISTRY;
export type SectionName = keyof ConfigRegistry;

/** Every section name, sorted — deterministic for anything generating from it. */
export function sectionNames(): SectionName[] {
  return (Object.keys(CONFIG_REGISTRY) as SectionName[]).sort();
}

/**
 * Every declared key as `section.key`, sorted.
 *
 * `consumes` is a top-level scalar rather than a nested section, so it renders
 * as the bare `consumes` — the registry models it as a one-key section to keep
 * the walk uniform, and this is where that shows.
 */
export function declaredKeys(): string[] {
  const out: string[] = [];
  for (const section of sectionNames()) {
    for (const key of Object.keys(CONFIG_REGISTRY[section])) {
      out.push(section === key ? key : `${section}.${key}`);
    }
  }
  return out.sort();
}

/** Look a key up without knowing which section owns it. */
export function describeKey(section: string, key: string): KeyDescriptor | undefined {
  const s = (CONFIG_REGISTRY as Readonly<Record<string, SectionDescriptor>>)[section];
  return s?.[key];
}

/** True when the descriptor carries a real default rather than the sentinel. */
export function hasDefault(d: KeyDescriptor): boolean {
  return d.default !== NO_DEFAULT;
}
