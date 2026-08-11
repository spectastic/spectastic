import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigParseError, parseConfigText, readConfigFile } from '../src/config/resolve.js';

/**
 * The parse half of the canonical config reader (086 FR-004).
 *
 * `readConfigFile` had a single test — that a missing directory yields `{}`.
 * Everything else about how configuration text becomes an object was
 * untested, including the `throw` policy that exists precisely so a typo'd
 * file cannot take effect silently as defaults. That policy is the whole
 * reason the seam is named, so it is the part most worth pinning.
 */

function projectWith(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-config-'));
  writeFileSync(join(dir, 'spectastic.json'), contents, 'utf8');
  return dir;
}

describe('parseConfigText', () => {
  it('returns the object a well-formed file describes', () => {
    expect(parseConfigText('{"enforce":{"waivers":[]}}')).toEqual({ enforce: { waivers: [] } });
  });

  it('treats a JSON value that is not an object as nothing to read', () => {
    // A bare array, string, number or null parses fine and still says nothing
    // about configuration — the caller wants a key/value bag or no opinion.
    for (const notAnObject of ['[]', '"a string"', '42', 'null', 'true']) {
      expect(parseConfigText(notAnObject)).toEqual({});
    }
  });

  it('defaults to {} on malformed JSON when no policy is given', () => {
    expect(parseConfigText('{ not json')).toEqual({});
  });

  it('throws a named error on malformed JSON under the throw policy', () => {
    expect(() => parseConfigText('{ not json', 'throw')).toThrow(ConfigParseError);
    // The message names the file, so a caller reporting it does not have to.
    expect(() => parseConfigText('{ not json', 'throw')).toThrow(/spectastic\.json is not valid JSON/);
  });

  it('does not throw on a non-object under the throw policy', () => {
    // Well-formed but uninteresting is not a parse failure — only unparseable is.
    expect(parseConfigText('[]', 'throw')).toEqual({});
  });
});

describe('readConfigFile', () => {
  it('reads and parses a project config', () => {
    expect(readConfigFile(projectWith('{"project":"acme/widget"}'))).toEqual({ project: 'acme/widget' });
  });

  it('treats an absent file as the project having said nothing', () => {
    const empty = mkdtempSync(join(tmpdir(), 'spectastic-config-'));
    expect(readConfigFile(empty)).toEqual({});
    // Absence is not a typo, so it stays silent under the throw policy too.
    expect(readConfigFile(empty, 'throw')).toEqual({});
  });

  it('surfaces a malformed file when the caller asked to be told', () => {
    const dir = projectWith('{"enforce": }');
    expect(readConfigFile(dir)).toEqual({});
    expect(() => readConfigFile(dir, 'throw')).toThrow(ConfigParseError);
  });
});
