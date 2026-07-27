import { describe, expect, it } from 'vitest';
import { parseCorpusDocument } from '../src/knowledge/parse.js';

/**
 * 051-knowledge-corpus T-010: red-first tests for the frontmatter parser.
 * parseCorpusDocument() never throws on malformed input — a corpus document
 * is untrusted third-party content (P-11), so a missing or invalid field
 * must surface as structured data downstream findings can render, never as
 * a crash. See T-110 (corpusWellFormedFindings) for the consumer.
 */

const VALID = `---
id: KB-001
origin: SEC release 34-99999
origin-url: https://sec.gov/example
edition: 2024-05-28
license: CC-BY-4.0
converter: hand-authored
content-hash: sha256:abc123
status: illustrative-excerpt
---

# US equities settlement

Settlement occurs on T+1.
`;

describe('parseCorpusDocument', () => {
  it('parses a valid document with full provenance frontmatter', () => {
    const doc = parseCorpusDocument(VALID, 'knowledge/finance/references/KB-001-settlement.md');
    expect(doc.id).toBe('KB-001');
    expect(doc.hasFrontmatter).toBe(true);
    expect(doc.missingFields).toEqual([]);
    expect(doc.provenance.origin).toBe('SEC release 34-99999');
    expect(doc.provenance['origin-url']).toBe('https://sec.gov/example');
    expect(doc.provenance.edition).toBe('2024-05-28');
    expect(doc.provenance.license).toBe('CC-BY-4.0');
    expect(doc.provenance.converter).toBe('hand-authored');
    expect(doc.provenance['content-hash']).toBe('sha256:abc123');
    expect(doc.provenance.status).toBe('illustrative-excerpt');
    expect(doc.body.trim().startsWith('# US equities settlement')).toBe(true);
  });

  it('reports a missing required field rather than silently omitting it', () => {
    const missingLicense = VALID.replace(/^license:.*\n/m, '');
    const doc = parseCorpusDocument(missingLicense, 'knowledge/x/references/KB-002-x.md');
    expect(doc.hasFrontmatter).toBe(true);
    expect(doc.missingFields).toContain('license');
    expect(doc.provenance.license).toBeUndefined();
  });

  it('reports every required field missing when there is no frontmatter fence at all', () => {
    const noFrontmatter = '# Just a document\n\nNo frontmatter here.\n';
    const doc = parseCorpusDocument(noFrontmatter, 'knowledge/x/references/KB-003-x.md');
    expect(doc.hasFrontmatter).toBe(false);
    expect(doc.id).toBeNull();
    expect(doc.missingFields.length).toBeGreaterThan(0);
    expect(doc.body.trim()).toBe('# Just a document\n\nNo frontmatter here.'.trim());
  });

  it('rejects a malformed KB id rather than accepting an arbitrary string', () => {
    const badId = VALID.replace('id: KB-001', 'id: not-an-id');
    const doc = parseCorpusDocument(badId, 'knowledge/x/references/x.md');
    expect(doc.id).toBeNull();
    expect(doc.missingFields).toContain('id');
  });

  it('never throws on unparseable YAML — degrades to a missing-frontmatter result', () => {
    const brokenYaml = '---\nid: [unterminated\n---\n\nbody\n';
    expect(() => parseCorpusDocument(brokenYaml, 'knowledge/x/references/x.md')).not.toThrow();
    const doc = parseCorpusDocument(brokenYaml, 'knowledge/x/references/x.md');
    expect(doc.hasFrontmatter).toBe(false);
    expect(doc.id).toBeNull();
  });

  // 2026-07-26-two-layer-corpus-identity amendment (T-1003's discovery): a
  // document identifies itself via EITHER id (legacy) or slug (new) — only
  // flag 'id' missing when a document has neither.

  it('reads a pack-internal slug from frontmatter', () => {
    const withSlug = VALID.replace('id: KB-001', 'slug: 001-settlement-windows');
    const doc = parseCorpusDocument(withSlug, 'knowledge/finance/references/001-settlement-windows.md');
    expect(doc.slug).toBe('001-settlement-windows');
    expect(doc.id).toBeNull();
  });

  it('does not flag "id" as missing when a valid slug is present instead', () => {
    const withSlug = VALID.replace('id: KB-001', 'slug: 001-settlement-windows');
    const doc = parseCorpusDocument(withSlug, 'knowledge/finance/references/001-settlement-windows.md');
    expect(doc.missingFields).not.toContain('id');
  });

  it('still flags "id" as missing when neither id nor slug is present', () => {
    const neither = VALID.replace('id: KB-001\n', '');
    const doc = parseCorpusDocument(neither, 'knowledge/x/references/x.md');
    expect(doc.id).toBeNull();
    expect(doc.slug).toBeNull();
    expect(doc.missingFields).toContain('id');
  });

  it('rejects a malformed slug the same way it rejects a malformed id', () => {
    const badSlug = VALID.replace('id: KB-001', 'slug: Not A Valid Slug!');
    const doc = parseCorpusDocument(badSlug, 'knowledge/x/references/x.md');
    expect(doc.slug).toBeNull();
    expect(doc.missingFields).toContain('id'); // neither id nor a valid slug present
  });

  it('a document can carry both id and slug during the migration window, with neither missing', () => {
    const both = VALID.replace('id: KB-001', 'id: KB-001\nslug: 001-settlement-windows');
    const doc = parseCorpusDocument(both, 'knowledge/finance/references/001-settlement-windows.md');
    expect(doc.id).toBe('KB-001');
    expect(doc.slug).toBe('001-settlement-windows');
    expect(doc.missingFields).not.toContain('id');
  });
});
