import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * The one-time corpus-discoverability hint marker (054-corpus-in-prompt, D-004).
 *
 * `.spectastic/corpus-hint-shown.json` records that the no-corpus discoverability
 * hint has already been shown once, mirroring `init/marker.ts`'s shape. Core
 * stays pure (it only ever returns an optional `corpusHint` string on a verb
 * result); this module is the CLI-owned edge that turns "hint present" into
 * "show it, but only once" by consulting and updating this marker.
 */

const MARKER_REL = join('.spectastic', 'corpus-hint-shown.json');

export function corpusHintMarkerPath(cwd: string): string {
  return join(cwd, MARKER_REL);
}

/** True if the hint has already been shown once in this project. */
export function corpusHintAlreadyShown(cwd: string): boolean {
  return existsSync(corpusHintMarkerPath(cwd));
}

/** Record that the hint has now been shown (creating `.spectastic/` if absent). */
export async function markCorpusHintShown(cwd: string): Promise<void> {
  const path = corpusHintMarkerPath(cwd);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ shown: true }, null, 2)}\n`, 'utf8');
}

/**
 * Print `hint` to stderr at most once per project (054 T-312). A no-op when
 * `hint` is absent (a corpus exists) or the marker already recorded a prior
 * showing. Every one of the five AI-verb CLI registrars calls this the same
 * way right after writing its output, so the discoverability nudge appears
 * exactly once across a project's whole no-corpus lifetime.
 */
export async function showCorpusHintOnce(cwd: string, hint: string | undefined): Promise<void> {
  if (!hint || corpusHintAlreadyShown(cwd)) return;
  process.stderr.write(`${hint}\n`);
  await markCorpusHintShown(cwd);
}
