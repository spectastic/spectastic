/**
 * createPackFetcher — selects a `PackFetcher` (061-corpus-ingester, plan
 * D-002), mirroring `createAIProvider`'s precedence shape
 * (`ai-factory.ts`): an env-selected stub wins for CI determinism
 * (`feedback-ai-in-ci-uses-stubs`), a `--from <path>` local checkout is the
 * next rung (bypasses fetching entirely), and the real fetcher — which
 * shells out to install a marketplace pack — is the fallback.
 */
import { RealPackFetcher } from '@spectastic/core/providers/pack-fetcher';
import type { PackFetcher } from '@spectastic/core/providers/pack-fetcher';
import { StubPackFetcher } from '@spectastic/core/providers/pack-fetcher-stub';

export interface CreatePackFetcherOptions {
  /** The `--from <path>` escape hatch — registers a local checkout, no fetch. */
  from?: string;
}

/** A trivial `PackFetcher` that resolves any coordinate to one fixed local
 * path — the `--from <path>` door (spec FR-008), never touching the real
 * fetcher or a network. */
class LocalPathFetcher implements PackFetcher {
  constructor(private readonly path: string) {}
  async fetch(): Promise<string> {
    return this.path;
  }
}

export function createPackFetcher(opts: CreatePackFetcherOptions = {}): PackFetcher {
  const stubScript = process.env['SPECTASTIC_PACK_STUB'];
  if (stubScript) return new StubPackFetcher(stubScript);
  if (opts.from) return new LocalPathFetcher(opts.from);
  return new RealPackFetcher();
}
