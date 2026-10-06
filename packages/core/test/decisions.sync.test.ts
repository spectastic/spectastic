import { describe, expect, it } from 'vitest';
import { buildIndex } from '../src/decisions/index.js';
import { planSync } from '../src/decisions/sync.js';
import type { DecisionIndexFetcher, DecisionSourceConfig, FetchResult } from '../src/decisions/sync.js';
import type { GovernanceDecision } from '../src/guardrail/types.js';

/**
 * `planSync` against a stub fetcher (spec 122-decision-index-federation,
 * FR-004, D-002). Pure: the fetcher is injected, so this never touches the
 * network or the filesystem — a source's existing pin travels in on its
 * `DecisionSourceConfig`, and the plan compares it against what the fetch
 * (once validated) actually hashes to. Four outcomes: `fetched` (no prior
 * pin), `unchanged` (fetched bytes hash to the same pin), `moved` (a
 * different hash — a reviewable pin change), `refused` (the fetch failed, or
 * the fetched text fails validation) — a refusal never touches the plan's
 * pin/text, so the caller's existing copy is left alone.
 */

const NOW = new Date('2026-09-19T00:00:00.000Z');
const OWNER = 'acme/payments';

const DECISION: GovernanceDecision = {
  id: 'D-003',
  specId: '002-ledger',
  status: 'accepted',
  paths: [],
  modules: [],
  resource: { coordinate: 'spectastic://acme/payments/datastore/ledger', owner: OWNER },
  reason: 'x',
};

function indexTextFor(decisions: GovernanceDecision[]): { text: string; hash: string } {
  const index = buildIndex(decisions, OWNER, NOW);
  return { text: `${JSON.stringify(index, null, 2)}\n`, hash: index.contentHash };
}

function stubFetcher(results: Record<string, FetchResult>): DecisionIndexFetcher {
  return {
    fetch: async (from) => results[from] ?? { ok: false, reason: `no stub result for "${from}"` },
  };
}

describe('planSync — outcomes', () => {
  it('fetched: a source with no prior pin', async () => {
    const { text, hash } = indexTextFor([DECISION]);
    const source: DecisionSourceConfig = { project: OWNER, from: './owner' };
    const results = await planSync([source], stubFetcher({ './owner': { ok: true, text } }));
    expect(results).toEqual([{ project: OWNER, outcome: 'fetched', pin: hash, text }]);
  });

  it('unchanged: the fetched bytes hash to the same pin already recorded', async () => {
    const { text, hash } = indexTextFor([DECISION]);
    const source: DecisionSourceConfig = { project: OWNER, from: './owner', pin: hash };
    const results = await planSync([source], stubFetcher({ './owner': { ok: true, text } }));
    expect(results).toEqual([{ project: OWNER, outcome: 'unchanged', pin: hash, text }]);
  });

  it('moved: the fetched bytes hash to a DIFFERENT hash than the recorded pin', async () => {
    const { text, hash } = indexTextFor([DECISION]);
    const source: DecisionSourceConfig = {
      project: OWNER,
      from: './owner',
      pin: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    };
    const results = await planSync([source], stubFetcher({ './owner': { ok: true, text } }));
    expect(results).toEqual([{ project: OWNER, outcome: 'moved', pin: hash, text }]);
  });

  it('refused: the fetch itself failed — no pin/text in the result', async () => {
    const source: DecisionSourceConfig = { project: OWNER, from: './owner' };
    const results = await planSync([source], stubFetcher({ './owner': { ok: false, reason: 'connection refused' } }));
    expect(results).toEqual([{ project: OWNER, outcome: 'refused', reason: 'connection refused' }]);
  });

  it('refused: the fetch succeeded but the text fails validation — no pin/text either', async () => {
    const source: DecisionSourceConfig = { project: OWNER, from: './owner' };
    const results = await planSync(
      [source],
      stubFetcher({ './owner': { ok: true, text: '{"schema":"not-a-real-schema"}' } }),
    );
    expect(results[0]?.project).toBe(OWNER);
    expect(results[0]?.outcome).toBe('refused');
    expect(results[0]?.pin).toBeUndefined();
    expect(results[0]?.text).toBeUndefined();
    expect(results[0]?.reason).toBeTruthy();
  });

  it("a wrong-project index also refuses (validated against the DECLARED project, not the file's own)", async () => {
    const { text } = indexTextFor([DECISION]);
    const source: DecisionSourceConfig = { project: 'someone-else/other', from: './owner' };
    const results = await planSync([source], stubFetcher({ './owner': { ok: true, text } }));
    expect(results[0]?.outcome).toBe('refused');
  });
});

describe('planSync — multiple sources, independent outcomes', () => {
  it('each source is planned independently — one refusal never affects another', async () => {
    const { text, hash } = indexTextFor([DECISION]);
    const sources: DecisionSourceConfig[] = [
      { project: OWNER, from: './owner' },
      { project: 'other/project', from: './other' },
    ];
    const results = await planSync(
      sources,
      stubFetcher({
        './owner': { ok: true, text },
        './other': { ok: false, reason: 'timeout' },
      }),
    );
    expect(results).toEqual([
      { project: OWNER, outcome: 'fetched', pin: hash, text },
      { project: 'other/project', outcome: 'refused', reason: 'timeout' },
    ]);
  });
});

describe('planSync — no sources', () => {
  it('returns an empty plan', async () => {
    expect(await planSync([], stubFetcher({}))).toEqual([]);
  });
});
