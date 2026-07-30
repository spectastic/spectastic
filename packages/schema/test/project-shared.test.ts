import { describe, expect, it } from 'vitest';
import { classifyProjectId, specResourceUri } from '../src/project-shared.js';

/**
 * 067-spec-project-identity T-010: red-first tests for the shared project-id
 * grammar and the spectastic:// URI composer (plan D-001/D-004). Mirrors
 * citation-shared.test.ts's shape.
 */

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
