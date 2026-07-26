/**
 * StubPackFetcher — the CI/offline `PackFetcher` (061-corpus-ingester,
 * plan D-002, NFR-002). Mirrors `StubAIProvider`'s object-or-file-path
 * script shape (015-ai-stub-injection): a coordinate → local-directory map,
 * loaded inline or from a JSON file on disk (the file form is what
 * `SPECTASTIC_PACK_STUB` points at). Unlike `StubAIProvider`'s sequential
 * response consumption, a coordinate always resolves to the same fixture
 * directory — there's no "next response" concept for a fetch.
 */
import { readFileSync } from 'node:fs';
import type { PackFetcher } from './pack-fetcher.js';

export class StubPackFetcherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StubPackFetcherError';
  }
}

/** coordinate (`<plugin>@<marketplace>`) → local fixture directory. */
export type PackFetcherScript = Record<string, string>;

export class StubPackFetcher implements PackFetcher {
  private readonly fixtures: PackFetcherScript;

  constructor(script: PackFetcherScript | string) {
    if (typeof script !== 'string') {
      this.fixtures = script;
      return;
    }
    let raw: string;
    try {
      raw = readFileSync(script, 'utf8');
    } catch (err) {
      throw new StubPackFetcherError(`failed to read script at ${script}: ${(err as Error).message}`);
    }
    try {
      this.fixtures = JSON.parse(raw) as PackFetcherScript;
    } catch (err) {
      throw new StubPackFetcherError(`script at ${script} is not valid JSON: ${(err as Error).message}`);
    }
  }

  async fetch(coordinate: string): Promise<string> {
    const path = this.fixtures[coordinate];
    if (path === undefined) {
      throw new StubPackFetcherError(`no fixture registered for coordinate "${coordinate}"`);
    }
    return path;
  }
}
