import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { packAgnosticismFindings, readMarketplaceManifest } from '../src/knowledge/pack-agnostic.js';
import { loadCorpus } from '../src/knowledge/index.js';
import { resolveCitation } from '../src/knowledge/resolve.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '..', '..', '..');

/**
 * 057-portable-domain-skill: red-first tests for packAgnosticismFindings
 * (plan D-001–D-004). A pack is inspected only when a marketplace.json
 * declares it distributable (D-002, the false-positive guard against 052's
 * SC-003 trap); the check flags spectastic vocabulary leaking into a
 * portable pack (never the portable KB-NNN/provenance convention, D-003)
 * and a missing/trivial SKILL.md discovery description (D-004).
 *
 * Setup only (T-001/T-002) — temp-dir + fixture-writer helpers; assertions
 * land per-story (T-100/T-101/T-200/T-201/T-300) as the check is built.
 */

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A temp project root. */
function projectRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'spectastic-pack-agnostic-'));
  dirs.push(dir);
  return dir;
}

/** Write one file, creating its parent directories. */
function writeFile(root: string, relPath: string, content: string): void {
  const full = join(root, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

const RICH_DESCRIPTION =
  'Finance-settlement domain knowledge — T+1/T+2 settlement windows, clearing-house cutover rules, and reconciliation exceptions. Useful when authoring a spec that touches settlement timing, coaching a reviewer through a clearing workflow, or answering "why does this rule exist" during a knowledge-share.';

/** A pack that carries zero spectastic vocabulary and a real description. */
function cleanPack(root: string, name: string): string {
  writeFile(
    root,
    `${name}/SKILL.md`,
    `---\nname: ${name}\ndescription: ${RICH_DESCRIPTION}\n---\n\n# ${name}\n\nDomain reference material.\n`,
  );
  writeFile(
    root,
    `${name}/references/KB-001-doc.md`,
    '---\nid: KB-001\norigin: TODO\norigin-url: TODO\nedition: 2026-01-01\nlicense: TODO\nconverter: TODO\ncontent-hash: TODO\nstatus: TODO\n---\n\n# A domain fact\n\nBody.\n',
  );
  return join(root, name);
}

/** A marketplace.json listing the given pack directory names as plugins. */
function writeMarketplace(root: string, packNames: string[]): string {
  const marketplacePath = join(root, 'marketplace.json');
  writeFile(root, 'marketplace.json', JSON.stringify({
    name: 'test-marketplace',
    plugins: packNames.map((name) => ({ name, source: `./${name}` })),
  }, null, 2));
  return marketplacePath;
}

describe('packAgnosticismFindings — portability leg (057, T-100)', () => {
  it('flags a marketplace-listed pack embedding spectastic vocabulary', () => {
    const root = projectRoot();
    writeFile(
      root,
      'dirty/SKILL.md',
      `---\nname: dirty\ndescription: ${RICH_DESCRIPTION}\n---\n\nCite this in a <spec-decision grounding="verified"> per /spectastic.plan.\n`,
    );
    const marketplacePath = writeMarketplace(root, ['dirty']);

    const findings = packAgnosticismFindings(marketplacePath);
    expect(findings.some((f) => f.rule === 'pack-not-portable')).toBe(true);
  });

  it('a clean pack (zero spectastic tokens, real KB metadata) produces zero portability findings', () => {
    const root = projectRoot();
    cleanPack(root, 'clean');
    const marketplacePath = writeMarketplace(root, ['clean']);

    const findings = packAgnosticismFindings(marketplacePath);
    expect(findings.filter((f) => f.rule === 'pack-not-portable')).toEqual([]);
  });
});

describe('packAgnosticismFindings — marketplace scoping (057, T-101)', () => {
  it('spectastic\'s own dogfood + scaffold packs produce zero findings — they are never marketplace-listed', () => {
    // No marketplace.json exists anywhere over these paths in the real repo.
    const dogfoodMarketplace = join(REPO_ROOT, 'knowledge', 'marketplace.json');
    const scaffoldMarketplace = join(REPO_ROOT, 'templates', 'knowledge', 'marketplace.json');
    expect(packAgnosticismFindings(dogfoodMarketplace)).toEqual([]);
    expect(packAgnosticismFindings(scaffoldMarketplace)).toEqual([]);
  });
});

describe('packAgnosticismFindings — discoverability leg (057, T-200)', () => {
  it('flags a marketplace-listed pack with no SKILL.md description', () => {
    const root = projectRoot();
    writeFile(root, 'undiscoverable/SKILL.md', '---\nname: undiscoverable\n---\n\nNo description at all.\n');
    const marketplacePath = writeMarketplace(root, ['undiscoverable']);

    const findings = packAgnosticismFindings(marketplacePath);
    expect(findings.some((f) => f.rule === 'pack-not-discoverable')).toBe(true);
  });

  it('flags a trivial (placeholder-length) description', () => {
    const root = projectRoot();
    writeFile(root, 'trivial/SKILL.md', '---\nname: trivial\ndescription: TBD\n---\n\nBody.\n');
    const marketplacePath = writeMarketplace(root, ['trivial']);

    const findings = packAgnosticismFindings(marketplacePath);
    expect(findings.some((f) => f.rule === 'pack-not-discoverable')).toBe(true);
  });

  it('a rich, multi-phase description produces zero discoverability findings', () => {
    const root = projectRoot();
    cleanPack(root, 'clean');
    const marketplacePath = writeMarketplace(root, ['clean']);

    const findings = packAgnosticismFindings(marketplacePath);
    expect(findings.filter((f) => f.rule === 'pack-not-discoverable')).toEqual([]);
  });
});

describe('packAgnosticismFindings — the real finance-settlement demo pack (057, T-201)', () => {
  it('passes both check legs — zero portability findings, zero discoverability findings', () => {
    const marketplacePath = join(REPO_ROOT, 'examples', 'knowledge', 'marketplace.json');
    const findings = packAgnosticismFindings(marketplacePath);
    expect(findings).toEqual([]);
  });
});

/**
 * 2026-07-26 061-corpus-ingester T-011 (plan D-006): the shared manifest
 * reader widens to surface the marketplace `name`, each plugin's `version`,
 * and the `renames` map alongside the existing `source` — the re-import
 * anchor coordinate (FR-004/FR-006). A malformed or absent manifest still
 * resolves to `null`, never a crash — the same graceful-degradation stance
 * `resolveMarketplacePacks` already established.
 */
describe('readMarketplaceManifest (061 T-011, plan D-006)', () => {
  it('surfaces the marketplace name, per-plugin version, and the renames map', () => {
    const root = projectRoot();
    const marketplacePath = join(root, 'marketplace.json');
    writeFile(root, 'marketplace.json', JSON.stringify({
      name: 'acme',
      plugins: [{ name: 'finance-settlement', source: './finance-settlement', version: '1.2.0' }],
      renames: { 'finance-old-name': 'finance-settlement' },
    }));

    const info = readMarketplaceManifest(marketplacePath);
    expect(info?.name).toBe('acme');
    expect(info?.plugins).toEqual([{ name: 'finance-settlement', source: './finance-settlement', version: '1.2.0' }]);
    expect(info?.renames).toEqual({ 'finance-old-name': 'finance-settlement' });
  });

  it('defaults version to undefined and renames to {} when the manifest omits them', () => {
    const root = projectRoot();
    const marketplacePath = join(root, 'marketplace.json');
    writeFile(root, 'marketplace.json', JSON.stringify({ name: 'acme', plugins: [{ name: 'x', source: './x' }] }));

    const info = readMarketplaceManifest(marketplacePath);
    expect(info?.plugins[0]).toEqual({ name: 'x', source: './x', version: undefined });
    expect(info?.renames).toEqual({});
  });

  it('resolves to null for a missing manifest (never a crash)', () => {
    const root = projectRoot();
    expect(readMarketplaceManifest(join(root, 'does-not-exist.json'))).toBeNull();
  });

  it('resolves to null for malformed JSON (never a crash)', () => {
    const root = projectRoot();
    writeFile(root, 'bad.json', '{ not valid json');
    expect(readMarketplaceManifest(join(root, 'bad.json'))).toBeNull();
  });
});

describe('the demo pack is citable in a spectastic repo with zero edit (057, T-300)', () => {
  it('the same, unedited pack resolves KB-001@edition via 052\'s resolveCitation once dropped under knowledge/', () => {
    const sourcePack = join(REPO_ROOT, 'examples', 'knowledge', 'finance-settlement');
    const sourceSkillMd = readFileSync(join(sourcePack, 'SKILL.md'), 'utf8');
    const sourceDoc = readFileSync(join(sourcePack, 'references', 'KB-001-settlement-windows.md'), 'utf8');

    // "Dropped into a spectastic repo" — a byte-for-byte copy under knowledge/,
    // never an edit. cpSync proves that: it copies verbatim, no transform step.
    const cwd = projectRoot();
    cpSync(sourcePack, join(cwd, 'knowledge', 'finance-settlement'), { recursive: true });

    // The copied files are identical to the source — genuinely unedited.
    expect(readFileSync(join(cwd, 'knowledge', 'finance-settlement', 'SKILL.md'), 'utf8')).toBe(sourceSkillMd);
    expect(
      readFileSync(join(cwd, 'knowledge', 'finance-settlement', 'references', 'KB-001-settlement-windows.md'), 'utf8'),
    ).toBe(sourceDoc);

    const packs = loadCorpus(cwd);
    const resolved = resolveCitation(packs, { id: 'KB-001', edition: '2026-07-25' });
    expect(resolved).not.toBeNull();
    expect(resolved!.kind).toBe('current');
    expect(resolved!.id).toBe('KB-001');
  });
});

/**
 * 063-corpus-discoverability T-300 (FR-005): a pack that self-declares
 * `tool-specific: true` in its own SKILL.md is spared by pack-not-portable —
 * so a corpus can list an inherently tool-specific pack as discoverable
 * without a false portability error, while a pack that doesn't declare
 * itself tool-specific (even an otherwise-identical one) still gets the
 * hard check.
 */
describe('packAgnosticismFindings — the tool-specific exemption (063 T-300, FR-005)', () => {
  it('a pack declaring tool-specific: true produces zero portability findings, even embedding spectastic vocabulary', () => {
    const root = projectRoot();
    writeFile(
      root,
      'dogfood/SKILL.md',
      `---\nname: dogfood\ndescription: ${RICH_DESCRIPTION}\ntool-specific: true\n---\n\nCite this in a <spec-decision grounding="verified"> per /spectastic.plan.\n`,
    );
    const marketplacePath = writeMarketplace(root, ['dogfood']);

    const findings = packAgnosticismFindings(marketplacePath);
    expect(findings).toEqual([]);
  });

  it('an otherwise-identical pack WITHOUT the flag still fails the hard check', () => {
    const root = projectRoot();
    writeFile(
      root,
      'undeclared/SKILL.md',
      `---\nname: undeclared\ndescription: ${RICH_DESCRIPTION}\n---\n\nCite this in a <spec-decision grounding="verified"> per /spectastic.plan.\n`,
    );
    const marketplacePath = writeMarketplace(root, ['undeclared']);

    const findings = packAgnosticismFindings(marketplacePath);
    expect(findings.some((f) => f.rule === 'pack-not-portable')).toBe(true);
  });
});
