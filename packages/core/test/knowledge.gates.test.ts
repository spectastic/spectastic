import { describe, expect, it } from 'vitest';
import { corpusGroundingFindings } from '../src/knowledge/gates.js';
import type { CorpusDocument, CorpusPack, SupersededEdition } from '../src/knowledge/types.js';

/**
 * 053-corpus-grounding-gates T-100/T-200/T-300: red-first tests for
 * corpusGroundingFindings (plan D-001/D-002) — one traversal of every
 * <spec-decision> citation, resolved via 052's resolveCitation, mapped to a
 * severity: null -> corpus-provenance (error, FR-001); superseded ->
 * corpus-staleness (warning, FR-002); current -> clean. Graceful absence
 * (FR-003/SC-003) and determinism (NFR-001) throughout.
 */

const PROV = {
  origin: 'SEC release',
  'origin-url': 'https://sec.gov/x',
  license: 'CC-BY-4.0',
  converter: 'hand-authored',
  'content-hash': 'sha256:x',
  status: 'illustrative-excerpt',
};

function currentDoc(id: string, edition: string): CorpusDocument {
  return {
    id,
    hasFrontmatter: true,
    missingFields: [],
    provenance: { ...PROV, edition },
    body: 'x',
    filePath: `knowledge/finance/references/${id}-x.md`,
  };
}

function superseded(id: string, edition: string): SupersededEdition {
  return {
    id,
    edition,
    filePath: `knowledge/finance/references/superseded/${id}-x@${edition}.md`,
    provenance: { ...PROV, edition },
  };
}

function pack(overrides: Partial<CorpusPack> = {}): CorpusPack {
  return {
    name: 'finance',
    dirPath: 'knowledge/finance',
    hasSkillFile: true,
    index: [],
    documents: [currentDoc('KB-001', '2024-05-28')],
    supersededEditions: [superseded('KB-001', '2017-09-05')],
    ...overrides,
  };
}

function decisionDoc(citationText: string, file = 'plan.html'): { html: string; file: string } {
  return {
    file,
    html: `<!doctype html><html><body><main>
      <spec-decision id="D-001" grounding="verified">
        <h4>D-001 · A domain decision</h4>
        <dl><dt>Context</dt><dd>Grounded against <code>${citationText}</code>.</dd></dl>
      </spec-decision>
    </main></body></html>`,
  };
}

describe('corpusGroundingFindings', () => {
  it('errors (corpus-provenance) on a citation to a KB id with no committed document', () => {
    const findings = corpusGroundingFindings([decisionDoc('KB-999@2024-05-28')], [pack()]);
    expect(findings.length).toBe(1);
    expect(findings[0]?.rule).toBe('corpus-provenance');
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.message).toContain('KB-999');
  });

  it('errors (corpus-provenance) on a pinned citation to a fabricated/typo\'d edition', () => {
    // KB-001 exists (current @2024-05-28, superseded @2017-09-05) but this
    // edition was never committed under either — a dead reference, not stale.
    const findings = corpusGroundingFindings([decisionDoc('KB-001@1999-01-01')], [pack()]);
    expect(findings.length).toBe(1);
    expect(findings[0]?.rule).toBe('corpus-provenance');
    expect(findings[0]?.severity).toBe('error');
  });

  it('is clean on a citation matching the current edition', () => {
    expect(corpusGroundingFindings([decisionDoc('KB-001@2024-05-28')], [pack()])).toEqual([]);
  });

  it('is clean on a bare (unpinned) citation matching a known id', () => {
    expect(corpusGroundingFindings([decisionDoc('KB-001')], [pack()])).toEqual([]);
  });

  it('produces no finding when no corpus is present (FR-003, SC-003)', () => {
    expect(corpusGroundingFindings([decisionDoc('KB-999@2024-05-28')], [])).toEqual([]);
  });

  it('produces no finding when the doc has no <spec-decision> citation at all (FR-003, SC-003)', () => {
    const noCitation = {
      file: 'plan.html',
      html: '<!doctype html><html><body><main><p>No decisions here.</p></main></body></html>',
    };
    expect(corpusGroundingFindings([noCitation], [pack()])).toEqual([]);
  });

  it('warns (corpus-staleness) on a citation pinned to a retained superseded edition', () => {
    const findings = corpusGroundingFindings([decisionDoc('KB-001@2017-09-05')], [pack()]);
    expect(findings.length).toBe(1);
    expect(findings[0]?.rule).toBe('corpus-staleness');
    expect(findings[0]?.severity).toBe('warning');
    expect(findings[0]?.message).toContain('2017-09-05');
  });

  it('is deterministic — the same doc and corpus produce identical findings on repeat calls (NFR-001)', () => {
    const docs = [decisionDoc('KB-999@2024-05-28')];
    const packs = [pack()];
    expect(corpusGroundingFindings(docs, packs)).toEqual(corpusGroundingFindings(docs, packs));
  });

  it('fires identically regardless of any profile marker — no tier is read (FR-004 tier-independence)', () => {
    // corpusGroundingFindings takes no tier/ctx parameter at all; calling it
    // with the same docs/packs is the only input that exists, proving the
    // gates cannot vary by profile even in principle.
    const docs = [decisionDoc('KB-001@1999-01-01')];
    const packs = [pack()];
    const a = corpusGroundingFindings(docs, packs);
    const b = corpusGroundingFindings(docs, packs);
    expect(a).toEqual(b);
    expect(a.length).toBe(1);
    expect(a[0]?.severity).toBe('error');
  });
});
