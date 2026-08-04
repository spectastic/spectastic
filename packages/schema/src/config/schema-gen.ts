/**
 * Generating the published JSON Schema (spec 087, FR-001 / FR-002 / NFR-001).
 *
 * A pure function from the registry to a schema object. No filesystem, no
 * clock, no environment — so determinism is structural rather than something a
 * test has to keep watch over, and the only way the schema can be wrong about
 * the configuration surface is for the registry to be wrong about it.
 *
 * Generated, never hand-written. A hand-maintained schema would be the third
 * source of truth that 086 exists to prevent, and its drift would be invisible
 * because both it and the registry would look authoritative.
 */

import { CONFIG_REGISTRY, NO_DEFAULT, type KeyDescriptor, type KeyType } from './registry.js';

/** JSON Schema types for the registry's own type tags. */
const JSON_TYPE: Readonly<Record<KeyType, Record<string, unknown>>> = {
  string: { type: 'string' },
  number: { type: 'number' },
  boolean: { type: 'boolean' },
  'string[]': { type: 'array', items: { type: 'string' } },
  object: { type: 'object' },
  'object[]': { type: 'array', items: { type: 'object' } },
};

function property(d: KeyDescriptor): Record<string, unknown> {
  const out: Record<string, unknown> = { ...JSON_TYPE[d.type], description: d.description };
  // A key with no default gets no `default` — rendering the sentinel, or an
  // empty string, would advertise a value the tool does not actually assume
  // (086 FR-002).
  if (d.default !== NO_DEFAULT) out.default = d.default;
  return out;
}

/**
 * Build the schema for a given package version.
 *
 * The version is passed in rather than read here, so the generator stays pure
 * and the caller — the build step — owns the one impure fact.
 */
export function generateConfigSchema(version: string): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    $schema: {
      type: 'string',
      description: 'Reference to this schema, so an editor can offer completion and documentation.',
    },
  };

  // Sorted so the output is byte-stable regardless of declaration order
  // (NFR-001). A spurious diff in a generated artifact trains reviewers to stop
  // reading them, which is how a real drift gets waved through.
  for (const section of Object.keys(CONFIG_REGISTRY).sort()) {
    const descriptors = CONFIG_REGISTRY[section as keyof typeof CONFIG_REGISTRY];
    const keys = Object.keys(descriptors).sort();

    // A top-level scalar is modelled as a one-key section whose key matches the
    // section name; it belongs at the root, not nested inside an object.
    if (keys.length === 1 && keys[0] === section) {
      properties[section] = property(descriptors[section as keyof typeof descriptors] as KeyDescriptor);
      continue;
    }

    const nested: Record<string, unknown> = {};
    for (const key of keys) nested[key] = property(descriptors[key as keyof typeof descriptors] as KeyDescriptor);
    properties[section] = {
      type: 'object',
      description: `The ${section} section.`,
      properties: nested,
      // Not `additionalProperties: false`: an unknown key is advisory here too,
      // because a config written by a newer version of the tool is
      // indistinguishable from a typo (D-003). The validate scan reports it;
      // the schema does not reject the file.
      additionalProperties: true,
    };
  }

  return {
    $schema: 'https://json-schema.org/draft-07/schema#',
    $id: `https://unpkg.com/@spectastic/schema@${version}/dist/config.schema.json`,
    title: 'spectastic.json',
    description: "Configuration for spectastic. Every key is optional; an absent key takes the tool's default.",
    type: 'object',
    properties,
    additionalProperties: true,
  };
}

/** The address a configuration should reference for a given version (FR-003). */
export function schemaUrl(version: string): string {
  return `https://unpkg.com/@spectastic/schema@${version}/dist/config.schema.json`;
}

/** Serialised exactly as the build step writes it, so a test can compare bytes. */
export function serialiseSchema(version: string): string {
  return `${JSON.stringify(generateConfigSchema(version), null, 2)}\n`;
}
