import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONFIG_REGISTRY, NO_DEFAULT, describeKey } from '../src/config/registry.js';
import { generateConfigSchema, schemaUrl, serialiseSchema } from '../src/config/schema-gen.js';

/**
 * Spec 087 — the generated schema.
 *
 * The schema holds no knowledge of its own, so it cannot be right about
 * something the registry is wrong about, nor wrong about something the registry
 * has right. These tests check the derivation, not the content.
 */

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');
const VERSION = (JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as { version: string }).version;

describe('the schema describes the registry @087:FR-001 @087:FR-002 @087:T-200', () => {
  const schema = generateConfigSchema(VERSION) as { properties: Record<string, Record<string, unknown>> };

  it('carries every declared section', () => {
    for (const section of Object.keys(CONFIG_REGISTRY)) {
      expect(schema.properties[section], section).toBeDefined();
    }
  });

  it('carries every key inside a section, with its description', () => {
    const git = schema.properties.git as { properties: Record<string, { description?: string }> };
    expect(Object.keys(git.properties).sort()).toEqual(['auto', 'trailers']);
    expect(git.properties.auto?.description).toBe(describeKey('git', 'auto')?.description);
  });

  it('renders a real default, and omits one for a key that has none @087:FR-002', () => {
    // The distinction 086 represents with a sentinel. Rendering it as a value
    // would advertise a default the tool does not assume.
    const corpus = schema.properties.corpus as { properties: Record<string, Record<string, unknown>> };
    expect(corpus.properties.root?.default).toBe('knowledge');
    expect(describeKey('corpus', 'marketplace')?.default).toBe(NO_DEFAULT);
    expect(corpus.properties.marketplace).not.toHaveProperty('default');
  });

  it('places a top-level scalar at the root rather than nesting it', () => {
    expect(schema.properties.consumes?.type).toBe('array');
  });

  it('permits the schema reference itself as a property', () => {
    expect(schema.properties.$schema?.type).toBe('string');
  });

  it('does not reject unknown keys outright — that judgement is the scan\'s @087:D-003', () => {
    // A config written by a newer version is indistinguishable from a typo, so
    // the schema describes rather than forbids.
    expect((schema as unknown as { additionalProperties: boolean }).additionalProperties).toBe(true);
  });

  it('pins the address to the package version @087:FR-003', () => {
    expect(schemaUrl(VERSION)).toContain(`@${VERSION}/`);
    expect((generateConfigSchema(VERSION) as { $id: string }).$id).toBe(schemaUrl(VERSION));
  });
});

describe('generation is deterministic @087:NFR-001', () => {
  it('produces byte-identical output across runs', () => {
    expect(serialiseSchema(VERSION)).toBe(serialiseSchema(VERSION));
  });

  it('sorts sections, so declaration order cannot change the file', () => {
    const props = Object.keys((generateConfigSchema(VERSION) as { properties: object }).properties).filter(
      (k) => k !== '$schema',
    );
    expect(props).toEqual([...props].sort());
  });
});

describe('the committed artifact matches the registry @087:FR-008 @087:T-300', () => {
  it('is not stale', () => {
    // A generated file in version control will occasionally be committed stale.
    // This is the check that makes that a failure rather than a silent
    // divergence between what ships and what the tool believes.
    const committed = readFileSync(join(pkgRoot, 'dist', 'config.schema.json'), 'utf8');
    expect(
      committed,
      'dist/config.schema.json is stale — run `node packages/schema/scripts/gen-schema.mjs`',
    ).toBe(serialiseSchema(VERSION));
  });
});
