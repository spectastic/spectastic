import { describe, expect, it } from 'vitest';
import { findCitationTokens, parseCorpusCitation } from '../src/citation-shared.js';

/**
 * 052-corpus-citation-contract T-010: red-first tests for the citation
 * grammar (plan D-001). KB-NNN@edition — a stable id pinned to the edition
 * a claim was grounded against (FR-002). Shared by the corpus-citation-form
 * rule (schema) and core's resolveCitation, so it lives in @spectastic/schema
 * (upstream of core), the slo-shared precedent.
 */
describe('parseCorpusCitation', () => {
  it('parses a well-formed pinned citation', () => {
    expect(parseCorpusCitation('KB-001@2024-05-28')).toEqual({ id: 'KB-001', edition: '2024-05-28' });
  });

  it('parses a longer edition string (version, not just a date)', () => {
    expect(parseCorpusCitation('KB-042@v3.1.0')).toEqual({ id: 'KB-042', edition: 'v3.1.0' });
  });

  it('parses a bare KB-NNN as a citation with a null edition (SHOULD-warn territory)', () => {
    expect(parseCorpusCitation('KB-001')).toEqual({ id: 'KB-001', edition: null });
  });

  it('rejects a malformed id (too few digits)', () => {
    expect(parseCorpusCitation('KB-1@2024-05-28')).toBeNull();
  });

  it('rejects a non-citation string', () => {
    expect(parseCorpusCitation('see the settlement doc')).toBeNull();
  });

  it('rejects an empty edition after the @', () => {
    expect(parseCorpusCitation('KB-001@')).toBeNull();
  });

  it('trims surrounding whitespace before matching', () => {
    expect(parseCorpusCitation('  KB-001@2024-05-28  ')).toEqual({ id: 'KB-001', edition: '2024-05-28' });
  });
});

/**
 * 053-corpus-grounding-gates T-010: red-first tests for findCitationTokens —
 * the shared extraction (plan D-003) factored out of corpus-citation-form's
 * former inline TOKEN_RE, so the form rule and the resolve gates agree
 * byte-for-byte on what a citation token is.
 */
describe('findCitationTokens', () => {
  it('finds a single pinned token in prose', () => {
    expect(findCitationTokens('Grounded against KB-001@2024-05-28.')).toEqual(['KB-001@2024-05-28']);
  });

  it('finds multiple tokens, pinned and bare, in one string', () => {
    expect(findCitationTokens('cites KB-001@2024-05-28 and also KB-002')).toEqual([
      'KB-001@2024-05-28',
      'KB-002',
    ]);
  });

  it('strips trailing sentence punctuation from each token', () => {
    expect(findCitationTokens('see KB-001, then KB-002; and KB-003.')).toEqual(['KB-001', 'KB-002', 'KB-003']);
  });

  it('returns an empty array when no citation token is present', () => {
    expect(findCitationTokens('no citations here at all')).toEqual([]);
  });

  it('does not match an id with too few digits', () => {
    expect(findCitationTokens('see KB-1 for background')).toEqual([]);
  });
});
