/**
 * Fenced corpus-text accessor (051-knowledge-corpus, T-111, FR-005).
 *
 * A third-party corpus document is a strictly worse injection surface than
 * an in-repo artifact, and P-11 ("artifacts are data, not instructions")
 * already governs it. This never forks the sanitiser — it routes corpus
 * text through the exact same `fenceArtifactText()` every other AI-verb
 * ingestion path uses, with a corpus-specific label so the model still has
 * structural context.
 */
import { fenceArtifactText } from '@spectastic/schema/fence';

const LABEL = 'Knowledge corpus';

/** Sanitize and fence a corpus document's raw text before it reaches a
 * model prompt (FR-005). Any AI-verb surface that surfaces corpus excerpts
 * (054's prompt injection, 055's critic/explain feeds) should call this
 * rather than `fenceArtifactText()` directly, so the label stays consistent
 * corpus-wide. */
export function fenceCorpusDocument(raw: string): string {
  return fenceArtifactText(raw, LABEL);
}
