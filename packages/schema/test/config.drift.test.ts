import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONFIG_REGISTRY, type SectionName } from '../src/config/registry.js';

/**
 * The completeness guard (spec 086, FR-006 / D-004).
 *
 * The registry's entire value is being trusted as complete: a schema, a
 * `config` command and a documentation page will all present it with
 * confidence. A list believed complete but quietly stale is therefore worse
 * than no list at all, because the confidence is the product.
 *
 * A type-level guarantee would be stronger and cannot work here — several
 * readers index the parsed object by string, which no compiler can follow. So
 * this is a textual scan, and it is deliberately biased toward false
 * *failures*: a pattern it does not recognise stops the build and gets taught,
 * rather than passing quietly and letting the registry rot.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const PACKAGES = ['schema', 'core', 'cli', 'corpus'];

/** Every `.ts` source file across the packages, excluding tests and builds. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const skip = new Set(['node_modules', 'dist', 'test', '__fixtures__', 'fixtures', 'coverage']);
  const walk = (dir: string): void => {
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (skip.has(e.name)) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.ts')) out.push(full);
    }
  };
  for (const p of PACKAGES) walk(join(repoRoot, 'packages', p, 'src'));
  return out.sort();
}

/**
 * Keys read off a parsed configuration object.
 *
 * Matches the shape the migrated readers actually use — a cast to a shape with
 * an optional property, which is how a section or a top-level key is picked out
 * of the parsed file.
 */
function configKeyReads(text: string): string[] {
  const found: string[] = [];
  // `(parsed as { corpus?: unknown }).corpus` and friends.
  for (const m of text.matchAll(/as \{\s*(\w+)\?:\s*[^}]*\}\s*\)\.(\w+)/g)) {
    if (m[1] === m[2] && m[1] !== undefined) found.push(m[1]);
  }
  return found;
}

/**
 * Section names AND the keys inside them.
 *
 * A reader picks a section out of the parsed file (`.corpus`) and then a key
 * out of the section (`.marketplace`) using the identical cast shape, so the
 * scan cannot tell the two apart from the text alone. Both are declared, which
 * is what the guard is actually checking — that nothing is read which the
 * registry has never heard of.
 */
const SECTIONS = new Set<string>([
  ...Object.keys(CONFIG_REGISTRY),
  ...Object.values(CONFIG_REGISTRY).flatMap((section) => Object.keys(section)),
]);
/**
 * Names that look like a config section read but are not one.
 *
 * Kept explicit rather than loosening the pattern: each entry is a decision
 * that this key belongs to some other file, and a reviewer can check it.
 */
const NOT_CONFIG = new Set([
  'name', // package.json
  'description', // package.json / SKILL.md front matter
  'version',
  'dependencies',
  'devDependencies',
  'profile', // .spectastic/profile.json marker
  'tier',
  'scripts',
  'workspaces',
  'exports',
  'main',
  'plugins', // marketplace manifest
  'owner', // marketplace manifest top-level
]);

describe('the registry stays complete @086:FR-006 @086:T-301', () => {
  it('declares every configuration section the source actually reads', () => {
    const undeclared: string[] = [];
    for (const file of sourceFiles()) {
      const text = readFileSync(file, 'utf8');
      // Only files that touch the configuration file can be reading its keys.
      if (!text.includes('spectastic.json') && !text.includes('CONFIG_FILE')) continue;
      for (const key of configKeyReads(text)) {
        if (SECTIONS.has(key) || NOT_CONFIG.has(key)) continue;
        undeclared.push(`${key}  (${file.replace(`${repoRoot}/`, '')})`);
      }
    }
    expect(undeclared, `undeclared configuration key(s) read by the source:\n  ${undeclared.join('\n  ')}`).toEqual(
      [],
    );
  });

  it('fails on a planted read of a key the registry does not declare @086:T-300 @086:SC-003', () => {
    // The guard proven rather than asserted (P-7). This is the exact shape a
    // future reader would introduce, and the check must not miss it.
    const planted = `
      const cfg = readConfigFile(cwd);
      const section = (cfg as { telemetry?: unknown }).telemetry;
    `;
    const keys = configKeyReads(planted);
    expect(keys).toContain('telemetry');
    expect(SECTIONS.has('telemetry')).toBe(false);
  });

  it('does not flag a declared section', () => {
    const legitimate = `const section = (parsed as { corpus?: unknown }).corpus;`;
    for (const key of configKeyReads(legitimate)) {
      expect(SECTIONS.has(key), key).toBe(true);
    }
  });

  it('records what the scan cannot see, rather than implying it sees everything', () => {
    // A computed key — `cfg[name]` — is invisible to a textual scan, and D-004
    // accepts that. Asserted so the limitation is a decision in the test suite
    // rather than a gap someone discovers later.
    expect(configKeyReads('const v = (cfg as Record<string, unknown>)[dynamicName];')).toEqual([]);
  });
});

describe('every declared section is actually used @086:FR-007', () => {
  it('does not declare a section no source file reads', () => {
    // The inverse drift: a key advertised in the registry that nothing
    // implements would make a generated document promise a capability the tool
    // does not have — which is the discoverability failure inverted, and
    // exactly what design.stackInterview was.
    const allText = sourceFiles()
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    const unread = (Object.keys(CONFIG_REGISTRY) as SectionName[]).filter((s) => !allText.includes(s));
    expect(unread, `declared but read nowhere: ${unread.join(', ')}`).toEqual([]);
  });
});
