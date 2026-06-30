import { describe, expect, it } from 'vitest';
import { extractSpecMetadata } from '../src/index.js';

/**
 * T-010 of specs/027-git-trailers/tasks.html. The git-trailers slice (D-002)
 * extends extractSpecMetadata to surface the <spec-meta> header fields
 * (owner / author / reviewers) that Author / Reviewed-by / Co-authored-by read.
 */

function specWith(metaRows: string): string {
  return `<!doctype html><html><body><main>
    <p class="small-caps">Specification · 027-git-trailers</p>
    <spec-meta>${metaRows}</spec-meta>
  </main></body></html>`;
}

describe('extractSpecMetadata header fields (T-010)', () => {
  it('extracts Owner and Reviewers from the <spec-meta> header', () => {
    const md = extractSpecMetadata(
      specWith(
        '<b>Owner</b><span>Brian Corbin · @briancorbinxyz</span>' +
          '<b>Reviewers</b><span>Jane Reviewer · @jane</span>',
      ),
    );
    expect(md.owner).toBe('Brian Corbin · @briancorbinxyz');
    expect(md.reviewers).toBe('Jane Reviewer · @jane');
  });

  it('surfaces an empty Reviewers placeholder (the omit-when-absent signal)', () => {
    const md = extractSpecMetadata(specWith('<b>Owner</b><span>X · @x</span><b>Reviewers</b><span>—</span>'));
    expect(md.owner).toBe('X · @x');
    expect(md.reviewers).toBe('—'); // the consumer treats — / empty as absent
  });

  it('extracts Author (proposals use Author rather than Owner)', () => {
    const md = extractSpecMetadata(specWith('<b>Author</b><span>P Roposer · @pr</span>'));
    expect(md.author).toBe('P Roposer · @pr');
    expect(md.owner).toBeNull();
  });

  it('returns null for header fields that are absent', () => {
    const md = extractSpecMetadata(specWith('<b>Status</b><span>Draft</span>'));
    expect(md.owner).toBeNull();
    expect(md.author).toBeNull();
    expect(md.reviewers).toBeNull();
  });

  it('still returns the existing specId/fr/nfr/sc shape', () => {
    const md = extractSpecMetadata(specWith('<b>Owner</b><span>X</span>'));
    expect(md.specId).toBe('027-git-trailers');
    expect(md.fr).toEqual([]);
  });
});
