/**
 * Attribution-trailer gathering for the git layer (spec 027-git-trailers, D-004).
 * Pure: given the artifact's `<spec-meta>` fields, the committer, and the verb's
 * provenance/model, it returns the ordered commit-footer trailers — applying the
 * human-only rule (FR-006) and omit-when-absent (FR-010). The effectful commit
 * (run.commit) renders them with `git commit --trailer`.
 *
 * Human trailers name humans; the AI appears only as `Assisted-by` (FR-005/FR-006).
 */

import type { Committer, Trailer } from './run.js';

export interface TrailerInput {
  /** Extracted `<spec-meta>` header fields (from extractSpecMetadata). */
  meta: {
    owner: string | null;
    author: string | null;
    reviewers: string | null;
  };
  /** The local git committer (for the Co-authored-by author≠committer test). */
  committer: Committer;
  /** Provenance link — the archived proposal/changelog (apply). `Refs`. */
  refs?: string | undefined;
  /** The assisting model — set only by AI-coupled verbs. `Assisted-by` (US2). */
  model?: string | undefined;
  /** The human who dispositioned the risk pass. `Acked-by` (US3). */
  dispositioner?: string | undefined;
}

/** A field is present when it carries real text — not empty, not an em-dash placeholder. */
function present(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.trim() !== '' && v.trim() !== '—';
}

/** The display-name portion of a `Name · @handle` person string. */
function nameOf(person: string): string {
  return (person.split('·')[0] ?? person).trim();
}

/**
 * The human attribution trailers (US1): Author ← Owner/Author; Reviewed-by ←
 * Reviewers; Co-authored-by ← the artifact author when a *different* human is
 * committing; Refs ← provenance. Each absent source is omitted, never faked.
 */
export function gatherTrailers(input: TrailerInput): Trailer[] {
  const trailers: Trailer[] = [];
  const author = input.meta.owner ?? input.meta.author;

  if (present(author)) trailers.push({ key: 'Author', value: author.trim() });

  // Co-authored-by: the artifact author authored but someone else is committing.
  if (present(author) && present(input.committer.name) && nameOf(author) !== input.committer.name.trim()) {
    trailers.push({ key: 'Co-authored-by', value: author.trim() });
  }

  if (present(input.meta.reviewers)) {
    trailers.push({ key: 'Reviewed-by', value: input.meta.reviewers.trim() });
  }

  // Acked-by: the human who dispositioned the risk pass (US3) — a human trailer.
  if (present(input.dispositioner)) {
    trailers.push({ key: 'Acked-by', value: input.dispositioner.trim() });
  }

  // Assisted-by: the AI, acknowledged as a tool — the ONLY place a model appears
  // (FR-005/FR-006). The model never reaches Author/Co-authored-by/Reviewed-by/Acked-by.
  if (present(input.model)) {
    trailers.push({ key: 'Assisted-by', value: input.model.trim() });
  }

  if (present(input.refs)) trailers.push({ key: 'Refs', value: input.refs.trim() });

  return trailers;
}
