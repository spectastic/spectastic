import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCorpus } from '../src/knowledge/index.js';
import { corpusWellFormedFindings } from '../src/knowledge/validate.js';

/**
 * 052-corpus-citation-contract T-200: red-first tests for the superseded-
 * edition loader walk (plan D-003, FR-003). A prior edition retained under
 * references/superseded/ must load into a SEPARATE supersededEditions
 * collection — never documents[] — so a KB-NNN@old-edition citation can
 * resolve (SC-002) AND 051's duplicate-id check never false-fires on a
 * legitimate current + prior pair (plan §8 R2).
 */

function doc(id: string, edition: string): string {
  return `---
id: ${id}
origin: SEC release
origin-url: https://sec.gov/x
edition: ${edition}
license: CC-BY-4.0
converter: hand-authored
content-hash: sha256:x
status: illustrative-excerpt
---

# ${id} @ ${edition}
`;
}

/** A pack with a current KB-001 (T+1) and a retained superseded KB-001 (T+2). */
function seedPackWithSuperseded(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'spectastic-superseded-'));
  const pack = join(cwd, 'knowledge', 'finance');
  mkdirSync(join(pack, 'references', 'superseded'), { recursive: true });
  writeFileSync(join(pack, 'SKILL.md'), '# finance\n');
  writeFileSync(
    join(pack, 'index.md'),
    [
      '| ID | Title | Description | Edition | Path |',
      '| --- | --- | --- | --- | --- |',
      '| KB-001 | Settlement | The cycle | 2024-05-28 | references/KB-001-settlement.md |',
      '',
    ].join('\n'),
  );
  writeFileSync(join(pack, 'references', 'KB-001-settlement.md'), doc('KB-001', '2024-05-28'));
  writeFileSync(
    join(pack, 'references', 'superseded', 'KB-001-settlement@2017-09-05.md'),
    doc('KB-001', '2017-09-05'),
  );
  return cwd;
}

describe('superseded-edition loading (052 T-200, FR-003)', () => {
  it('loads a prior edition into supersededEditions, not documents[]', () => {
    const packs = loadCorpus(seedPackWithSuperseded());
    const pack = packs.find((p) => p.name === 'finance');
    expect(pack).toBeDefined();
    // Exactly one CURRENT document, with the current edition.
    expect(pack?.documents.length).toBe(1);
    expect(pack?.documents[0]?.provenance.edition).toBe('2024-05-28');
    // The prior edition is in the separate collection.
    expect(pack?.supersededEditions?.length).toBe(1);
    expect(pack?.supersededEditions?.[0]?.id).toBe('KB-001');
    expect(pack?.supersededEditions?.[0]?.edition).toBe('2017-09-05');
  });

  it('a current + superseded pair sharing one KB id produces zero corpus-well-formed findings', () => {
    const packs = loadCorpus(seedPackWithSuperseded());
    expect(corpusWellFormedFindings(packs)).toEqual([]);
  });

  it('a pack with no superseded/ directory has an empty supersededEditions', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-superseded-none-'));
    const pack = join(cwd, 'knowledge', 'plain');
    mkdirSync(join(pack, 'references'), { recursive: true });
    writeFileSync(join(pack, 'SKILL.md'), '# plain\n');
    writeFileSync(
      join(pack, 'index.md'),
      '| ID | Title | Description | Edition | Path |\n| --- | --- | --- | --- | --- |\n| KB-001 | X | x | 2024-05-28 | references/KB-001-x.md |\n',
    );
    writeFileSync(join(pack, 'references', 'KB-001-x.md'), doc('KB-001', '2024-05-28'));
    const loaded = loadCorpus(cwd).find((p) => p.name === 'plain');
    expect(loaded?.supersededEditions).toEqual([]);
  });
});
