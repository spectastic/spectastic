/**
 * Plan a decisions sync (spec 122-decision-index-federation, D-002). Pure:
 * the fetcher is injected as a port, so this module imports no network code
 * and the guardrail no-network import scan's meaning extends to it without
 * an edit. The two edge adapters (path, https) live in
 * `providers/decision-index-fetcher.ts` and are wired in by the CLI only.
 */

import { validateIndex } from './index.js';

export interface DecisionSourceConfig {
  project: string;
  from: string;
  pin?: string;
}

/** A source's fetch result, or the reason it could not be fetched. */
export type FetchResult = { ok: true; text: string } | { ok: false; reason: string };

/** Injected at the edge — `providers/decision-index-fetcher.ts` implements
 *  this for a repo-relative path and for `https:`. */
export interface DecisionIndexFetcher {
  fetch(from: string): Promise<FetchResult>;
}

export type SyncOutcome = 'fetched' | 'unchanged' | 'moved' | 'refused';

export interface SyncSourceResult {
  project: string;
  outcome: SyncOutcome;
  reason?: string;
  /** The new pin, when the outcome is `fetched` or `moved`. */
  pin?: string;
  text?: string;
}

/** Plan one source: fetch, validate against its declared project, then
 *  compare the resulting hash to the pin already recorded for it. A
 *  fetch failure or a validation failure are both `refused` — the existing
 *  vendored copy and pin are left untouched by this plan either way. */
async function planOne(source: DecisionSourceConfig, fetcher: DecisionIndexFetcher): Promise<SyncSourceResult> {
  const fetched = await fetcher.fetch(source.from);
  if (!fetched.ok) return { project: source.project, outcome: 'refused', reason: fetched.reason };

  const validated = validateIndex(fetched.text, source.project);
  if (!validated.ok) return { project: source.project, outcome: 'refused', reason: validated.reason };

  const hash = validated.index.contentHash;
  let outcome: SyncOutcome;
  if (source.pin === undefined) outcome = 'fetched';
  else if (source.pin === hash) outcome = 'unchanged';
  else outcome = 'moved';
  return { project: source.project, outcome, pin: hash, text: fetched.text };
}

/** Fetch and validate each source; a source that fails to fetch or validate
 *  is `refused` and its existing copy/pin are left untouched (spec FR-004).
 *  Does not write anything — the CLI action performs the file writes and
 *  config update from this plan. Sources are planned independently: one
 *  refusal never affects another. */
export async function planSync(
  sources: readonly DecisionSourceConfig[],
  fetcher: DecisionIndexFetcher,
): Promise<SyncSourceResult[]> {
  return Promise.all(sources.map((source) => planOne(source, fetcher)));
}
