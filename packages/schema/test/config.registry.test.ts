import { describe, expect, it } from 'vitest';
import {
  CONFIG_REGISTRY,
  NO_DEFAULT,
  declaredKeys,
  describeKey,
  hasDefault,
  sectionNames,
} from '../src/config/registry.js';
import { configValue, readConfigFile, resolveConfig } from '../src/config/resolve.js';

/**
 * Spec 086 — the canonical config reader.
 *
 * The defect being closed: the defaults were sixteen inline fallbacks, so
 * nothing could enumerate them and nothing could tell a user what the tool had
 * decided on their behalf.
 */

describe('the registry enumerates without knowing what any key means @086:FR-001 @086:T-100', () => {
  it('lists every section, deterministically', () => {
    const names = sectionNames();
    expect(names).toEqual([...names].sort());
    // Eleven sections. `run` is deliberately absent — commands/run.ts resolves
    // the decider config, not a section of its own. `implement` joined in
    // 090's change 2026-08-12-drain-all-default, once a reader existed: the
    // registry declares a key only when something reads it, which is why
    // `design.stackInterview` was withdrawn rather than added.
    expect(names).toHaveLength(11);
    expect(names).toContain('implement');
    expect(names).not.toContain('run');
  });

  it('lists every key without a caller knowing which module consumes it', () => {
    const keys = declaredKeys();
    expect(keys).toContain('git.auto');
    expect(keys).toContain('verify.executeCapturedCommands');
    expect(keys).toContain('corpus.root');
    // A top-level scalar renders bare rather than doubled.
    expect(keys).toContain('consumes');
    expect(keys).not.toContain('consumes.consumes');
  });

  it('gives every key a description written for a user', () => {
    for (const section of sectionNames()) {
      for (const [key, d] of Object.entries(CONFIG_REGISTRY[section])) {
        expect(d.description.length, `${section}.${key}`).toBeGreaterThan(20);
      }
    }
  });

  it('omits the advertised key that has no reader @086:FR-007', () => {
    // design.stackInterview is in the README and honoured by command markdown,
    // but implemented in no package. Declaring it would make this list assert a
    // capability that does not exist.
    expect(sectionNames()).not.toContain('design');
    expect(describeKey('design', 'stackInterview')).toBeUndefined();
  });
});

describe('a key with no default is not a key defaulting to nothing @086:FR-002', () => {
  it('marks an identity as having no default rather than an empty string', () => {
    const d = describeKey('project', 'project');
    expect(d?.default).toBe(NO_DEFAULT);
    expect(hasDefault(d!)).toBe(false);
  });

  it('marks a real default as present', () => {
    expect(hasDefault(describeKey('corpus', 'root')!)).toBe(true);
    expect(describeKey('corpus', 'root')?.default).toBe('knowledge');
  });

  it('pins the security-relevant defaults, which fail closed @086:FR-005', () => {
    // These two are the reason NFR-001 forbids the resolver throwing: the safe
    // answer must survive a malformed file.
    expect(describeKey('verify', 'executeCapturedCommands')?.default).toBe(false);
    expect(describeKey('git', 'auto')?.default).toBe('off');
    expect(describeKey('git', 'trailers')?.default).toBe('off');
  });
});

describe('resolution reports where each value came from @086:FR-004 @086:T-101', () => {
  it('reports a written value as coming from the file', () => {
    const r = resolveConfig({ corpus: { root: 'kb' } });
    expect(r.corpus.root).toEqual({ value: 'kb', origin: 'file' });
  });

  it('reports an unwritten value as coming from the default', () => {
    expect(resolveConfig({}).corpus.root).toEqual({ value: 'knowledge', origin: 'default' });
  });

  it('distinguishes "explicitly set to the default" from "left alone"', () => {
    // A real distinction for a user reasoning about their own file, and one the
    // old inline fallbacks could not express.
    expect(resolveConfig({ verify: { executeCapturedCommands: false } }).verify.executeCapturedCommands.origin).toBe(
      'file',
    );
    expect(resolveConfig({}).verify.executeCapturedCommands.origin).toBe('default');
  });

  it('reports a key with no default and no value as unset, not as a default', () => {
    expect(resolveConfig({}).project.project).toEqual({ value: undefined, origin: 'unset' });
  });

  it('reads a top-level scalar from the root rather than a nested object', () => {
    const r = resolveConfig({ consumes: ['spectastic://a/b/unit/c'] });
    expect(r.consumes.consumes.value).toEqual(['spectastic://a/b/unit/c']);
  });
});

describe('failing safe @086:NFR-001', () => {
  it('treats an absent file as the project saying nothing', () => {
    expect(readConfigFile('/definitely/not/a/real/directory')).toEqual({});
  });

  it('never throws on a malformed section, and still yields the safe default', () => {
    // A section that is not an object would have crashed a naive reader.
    for (const broken of [{ verify: 'yes' }, { verify: [] }, { verify: null }]) {
      const r = resolveConfig(broken as Record<string, unknown>);
      expect(r.verify.executeCapturedCommands.value).toBe(false);
      expect(r.verify.executeCapturedCommands.origin).toBe('default');
    }
  });

  it('is deterministic — the same input resolves identically every time', () => {
    const input = { git: { auto: 'commit' } };
    expect(JSON.stringify(resolveConfig(input))).toBe(JSON.stringify(resolveConfig(input)));
  });

  it('offers the bare value for callers that do not care about origin @086:D-003', () => {
    expect(configValue('/definitely/not/a/real/directory', 'corpus', 'root')).toBe('knowledge');
  });
});
