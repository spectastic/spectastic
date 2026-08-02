import { describe, expect, it } from 'vitest';
import {
  classifyProjectId,
  contractResourceUri,
  corpusResourceUri,
  parseResourceUri,
  resourceUri,
  specResourceUri,
} from '../src/project-shared.js';
import { RESOURCE_URI_MATRIX } from './fixtures/resource-uri-matrix.js';

/**
 * 067-spec-project-identity T-010: red-first tests for the shared project-id
 * grammar and the spectastic:// URI composer (plan D-001/D-004). Mirrors
 * citation-shared.test.ts's shape.
 */

/**
 * 078-federated-resource-uri T-010: locks specResourceUri's and
 * contractResourceUri's existing output byte-for-byte BEFORE the grammar is
 * extended with a corpus kind and an edition parameter (FR-012) — so a
 * later change that breaks either fails loudly, not silently.
 */
describe('FR-012 regression guard — existing spec/contract output is untouched by the corpus-kind extension', () => {
  it('specResourceUri renders exactly as before', () => {
    expect(specResourceUri('spectastic/spectastic', '042')).toBe('spectastic://spectastic/spectastic/spec/042');
    expect(specResourceUri('spectastic/spectastic', '042', 'REQ-FORMAT-004')).toBe(
      'spectastic://spectastic/spectastic/spec/042#REQ-FORMAT-004',
    );
    expect(specResourceUri('spectastic', '042')).toBe('spectastic://spectastic/spec/042');
  });

  it('contractResourceUri renders exactly as before', () => {
    expect(contractResourceUri('acme/svc-a', 'orders-api')).toBe('spectastic://acme/svc-a/contract/orders-api');
    expect(contractResourceUri('acme/svc-a', 'orders-api', 'schema')).toBe(
      'spectastic://acme/svc-a/contract/orders-api#schema',
    );
  });
});

/**
 * 078-federated-resource-uri T-100: red-first tests for corpusResourceUri —
 * marketplace authority (FR-002), no KB-NNNN anywhere in the output
 * (FR-001), edition-before-anchor ordering (FR-003), and the corpus-only
 * lowercase fold (D-004).
 */
describe('corpusResourceUri (078 T-110, D-001/D-004)', () => {
  it('composes every entry in the corpus slice of the coordinate matrix', () => {
    for (const c of RESOURCE_URI_MATRIX.filter((f) => f.kind === 'corpus')) {
      const [plugin, slug] = c.name.split('/') as [string, string];
      expect(corpusResourceUri(c.project, plugin, slug, c.anchor, c.edition), c.label).toBe(c.expected);
    }
  });

  it('uses the marketplace as authority, never a project identity, even when the two differ', () => {
    expect(corpusResourceUri('acme-marketplace', 'spectastic-concepts', '001-foundations')).toBe(
      'spectastic://acme-marketplace/corpus/spectastic-concepts/001-foundations',
    );
  });

  it('never incorporates a KB-NNNN id — the composer has no parameter for one', () => {
    const uri = corpusResourceUri('spectastic', 'spectastic-concepts', '001-foundations');
    expect(uri).not.toMatch(/KB-\d+/);
  });

  it('lowercases a mixed-case marketplace before rendering (D-004)', () => {
    expect(corpusResourceUri('Spectastic', 'spectastic-concepts', '001-foundations')).toBe(
      'spectastic://spectastic/corpus/spectastic-concepts/001-foundations',
    );
    expect(corpusResourceUri('Acme-Corp', 'pack', 'doc')).toBe('spectastic://acme-corp/corpus/pack/doc');
  });

  it('does NOT lowercase spec or contract authorities — the fold is corpus-only (FR-012)', () => {
    expect(specResourceUri('Acme-Corp/Repo', '042')).toBe('spectastic://Acme-Corp/Repo/spec/042');
    expect(contractResourceUri('Acme-Corp/Repo', 'orders-api')).toBe(
      'spectastic://Acme-Corp/Repo/contract/orders-api',
    );
  });
});

describe('classifyProjectId', () => {
  it('classifies an owner-qualified id (contains a slash)', () => {
    expect(classifyProjectId('spectastic/spectastic')).toBe('owner-qualified');
    expect(classifyProjectId('some-org/some-repo_2')).toBe('owner-qualified');
  });

  it('classifies a multi-segment (subgroup-style) id as owner-qualified', () => {
    expect(classifyProjectId('group/subgroup/repo')).toBe('owner-qualified');
  });

  it('classifies a bare, unqualified default (no slash) as bare', () => {
    expect(classifyProjectId('spectastic')).toBe('bare');
  });

  it('classifies illegal characters or malformed shapes as malformed', () => {
    expect(classifyProjectId('')).toBe('malformed');
    expect(classifyProjectId(' spectastic')).toBe('malformed'); // leading whitespace
    expect(classifyProjectId('spectastic ')).toBe('malformed'); // trailing whitespace
    expect(classifyProjectId('spectastic/')).toBe('malformed'); // trailing slash, empty segment
    expect(classifyProjectId('/spectastic')).toBe('malformed'); // leading slash, empty segment
    expect(classifyProjectId('a//b')).toBe('malformed'); // double slash, empty segment
    expect(classifyProjectId('spec tastic/repo')).toBe('malformed'); // embedded space
    expect(classifyProjectId('spectastic/répo')).toBe('malformed'); // non-ASCII
  });
});

describe('specResourceUri', () => {
  it('composes an owner-as-authority URI for an owner-qualified project', () => {
    expect(specResourceUri('spectastic/spectastic', '042')).toBe('spectastic://spectastic/spectastic/spec/042');
  });

  it('appends an anchor fragment when given', () => {
    expect(specResourceUri('spectastic/spectastic', '042', 'REQ-FORMAT-004')).toBe(
      'spectastic://spectastic/spectastic/spec/042#REQ-FORMAT-004',
    );
  });

  it('omits the anchor fragment when not given', () => {
    expect(specResourceUri('spectastic/spectastic', '042')).not.toContain('#');
  });

  it('handles a multi-segment (subgroup) project by keeping the rest as path', () => {
    expect(specResourceUri('group/subgroup/repo', '001')).toBe('spectastic://group/subgroup/repo/spec/001');
  });

  it('degrades gracefully for a bare (no-slash) project — the provisional state', () => {
    expect(specResourceUri('spectastic', '042')).toBe('spectastic://spectastic/spec/042');
  });

  it('is a pure function — identical input yields byte-identical output', () => {
    const a = specResourceUri('spectastic/spectastic', '042', 'FR-001');
    const b = specResourceUri('spectastic/spectastic', '042', 'FR-001');
    expect(a).toBe(b);
  });
});

/**
 * 078-federated-resource-uri T-200: red-first round-trip test — compose →
 * parse → compose returns the original coordinate, across every kind and
 * every combination of edition pin and anchor (FR-008, SC-002).
 */
describe('parseResourceUri — round-trip (078 T-210, FR-008/SC-002)', () => {
  it('round-trips every entry in the coordinate matrix: compose(parse(compose(x))) === compose(x)', () => {
    for (const c of RESOURCE_URI_MATRIX) {
      const composed = resourceUri(c.project, c.kind, c.name, c.anchor, c.edition);
      expect(composed, c.label).toBe(c.expected);

      const parsed = parseResourceUri(composed);
      expect(parsed.ok, `${c.label} — expected parse to succeed`).toBe(true);
      if (!parsed.ok) continue;

      const recomposed = resourceUri(parsed.value.project, parsed.value.kind, parsed.value.name, parsed.value.anchor, parsed.value.edition);
      expect(recomposed, `${c.label} — round-trip`).toBe(composed);
    }
  });

  it('round-trips an owner-qualified (subgroup) project unchanged', () => {
    const composed = resourceUri('acme/svc-a/deep-group', 'contract', 'orders-api');
    const parsed = parseResourceUri(composed);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.project).toBe('acme/svc-a/deep-group');
    expect(resourceUri(parsed.value.project, parsed.value.kind, parsed.value.name, parsed.value.anchor, parsed.value.edition)).toBe(
      composed,
    );
  });
});

/**
 * 078-federated-resource-uri T-201: red-first tests for kind detection
 * (FR-005) and the never-throws/no-partial-result contract on malformed and
 * unknown-kind input (FR-007).
 */
describe('parseResourceUri — kind detection and failure contract (078 T-210, FR-005/FR-007)', () => {
  it.each([
    ['spectastic://spectastic/spec/042', 'spec'],
    ['spectastic://acme/svc-a/contract/orders-api', 'contract'],
    ['spectastic://spectastic/corpus/pack/doc', 'corpus'],
  ] as const)('reports %s as kind %s', (uri, expectedKind) => {
    const result = parseResourceUri(uri);
    expect(result.ok && result.value.kind).toBe(expectedKind);
  });

  it('yields a typed failure — never throws — for a malformed URI', () => {
    expect(() => parseResourceUri('not a uri at all')).not.toThrow();
    expect(parseResourceUri('not a uri at all').ok).toBe(false);

    expect(() => parseResourceUri('')).not.toThrow();
    expect(parseResourceUri('').ok).toBe(false);
  });

  it('yields a typed failure for a well-formed URI with an unrecognised kind segment', () => {
    const result = parseResourceUri('spectastic://acme/unknown-kind/thing');
    expect(result.ok).toBe(false);
  });

  it('yields a typed failure for a non-spectastic scheme', () => {
    const result = parseResourceUri('https://spectastic/spec/042');
    expect(result.ok).toBe(false);
  });

  it('yields a typed failure for a missing authority (triple-slash, no host)', () => {
    const result = parseResourceUri('spectastic:///spec/042');
    expect(result.ok).toBe(false);
  });

  it('yields a typed failure for a kind with no name segment after it', () => {
    const result = parseResourceUri('spectastic://spectastic/spec');
    expect(result.ok).toBe(false);
  });

  it('never returns a partially-populated value on failure', () => {
    const result = parseResourceUri('not a uri at all');
    expect(result.ok).toBe(false);
    expect('value' in result).toBe(false);
  });
});
