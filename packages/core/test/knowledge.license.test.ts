import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCorpus } from '../src/knowledge/index.js';
import { corpusLicenseFindings } from '../src/knowledge/license.js';
import { corpusWellFormedFindings } from '../src/knowledge/validate.js';

/**
 * 058-corpus-licensing T-100/T-101/T-102/T-200: red-first tests for
 * corpusLicenseFindings (plan D-001/D-003) — a restrictive/unrecognised/
 * placeholder declared license warns; a permissive one is silent; the
 * finding wording stays descriptive, never adjudicative (NFR-001). A missing
 * license is 051's existing error, not this rule's concern (plan D-002) —
 * confirmed here rather than re-implemented.
 */

function doc(license: string | undefined): string {
  const licenseLine = license !== undefined ? `license: ${license}\n` : '';
  return `---
id: KB-001
origin: Example origin
origin-url: https://example.com
edition: 2024-05-28
${licenseLine}converter: hand-authored
content-hash: sha256:x
status: illustrative-excerpt
---

# KB-001
`;
}

/** A single-pack, single-document temp corpus declaring the given license
 * (or none, when `license` is undefined) — the fixture every test below
 * loads via the real `loadCorpus()` roundtrip, mirroring 052's
 * seedPackWithSuperseded shape. */
function seedPackWithLicense(license: string | undefined): string {
  const cwd = mkdtempSync(join(tmpdir(), 'spectastic-license-'));
  const pack = join(cwd, 'knowledge', 'pack');
  mkdirSync(join(pack, 'references'), { recursive: true });
  writeFileSync(join(pack, 'SKILL.md'), '# pack\n');
  writeFileSync(
    join(pack, 'index.md'),
    [
      '| ID | Title | Description | Edition | Path |',
      '| --- | --- | --- | --- | --- |',
      '| KB-001 | Title | Desc | 2024-05-28 | references/KB-001-doc.md |',
      '',
    ].join('\n'),
  );
  writeFileSync(join(pack, 'references', 'KB-001-doc.md'), doc(license));
  return cwd;
}

describe('corpusLicenseFindings (058 T-100/T-101/T-102)', () => {
  it('a restrictive license produces a corpus-license warning', () => {
    const packs = loadCorpus(seedPackWithLicense('CC-BY-NC-4.0'));
    const findings = corpusLicenseFindings(packs);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('corpus-license');
    expect(findings[0]?.severity).toBe('warning');
  });

  it.each(['MIT', 'CC0-1.0', 'mit'])('a permissive license (%s) produces no finding', (license) => {
    const packs = loadCorpus(seedPackWithLicense(license));
    expect(corpusLicenseFindings(packs)).toEqual([]);
  });

  it.each(['Proprietary-Internal-1.0', 'TODO'])(
    'an unrecognised or placeholder license ("%s") warns — never silently treated as permissive',
    (license) => {
      const packs = loadCorpus(seedPackWithLicense(license));
      const findings = corpusLicenseFindings(packs);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.rule).toBe('corpus-license');
    },
  );

  it('the finding names the declared license and stays descriptive, never adjudicative', () => {
    const packs = loadCorpus(seedPackWithLicense('CC-BY-ND-4.0'));
    const findings = corpusLicenseFindings(packs);
    const message = findings[0]?.message ?? '';
    expect(message).toContain('CC-BY-ND-4.0');
    // Never claims legal incompatibility or effect (NFR-001's recorded ceiling).
    expect(message.toLowerCase()).not.toContain('incompatib');
    expect(message.toLowerCase()).not.toContain('not permitted');
    expect(message.toLowerCase()).not.toContain('illegal');
    expect(message.toLowerCase()).not.toContain('violat');
  });

  it('returns no findings for an empty corpus', () => {
    expect(corpusLicenseFindings([])).toEqual([]);
  });
});

describe('corpusLicenseFindings — missing license is 051\'s concern, not this rule\'s (058 T-200, plan D-002)', () => {
  it('a document with no license field produces a corpus-well-formed error, not a corpus-license finding', () => {
    const packs = loadCorpus(seedPackWithLicense(undefined));
    const licenseFindings = corpusLicenseFindings(packs);
    expect(licenseFindings).toEqual([]); // this rule adds no redundant missing-license warning

    const wellFormedFindings = corpusWellFormedFindings(packs);
    expect(
      wellFormedFindings.some(
        (f) => f.rule === 'corpus-well-formed' && f.severity === 'error' && f.message.includes('license'),
      ),
    ).toBe(true);
  });
});

describe('README redistribution policy (058 T-300, FR-003/FR-004)', () => {
  it('names what may be committed, the by-reference requirement, and the MCP/origin-url escape hatch', () => {
    const readme = readFileSync(new URL('../../../README.md', import.meta.url), 'utf8');
    expect(readme).toContain('corpus-license');
    expect(readme.toLowerCase()).toContain('by-reference');
    expect(readme).toContain('MCP');
    expect(readme).toContain('origin-url');
  });
});
