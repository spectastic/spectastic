import { describe, expect, it } from 'vitest';
import { verdictCommand } from '../src/commands/verdict.js';
import { buildIndex } from '../src/decisions/index.js';
import type { FileSystem, KernelContext } from '../src/types.js';
import type { GovernanceDecision } from '../src/guardrail/types.js';

/**
 * The federated verdict (spec 122-decision-index-federation, FR-006/FR-007/
 * FR-008, D-001). `verdictCommand` widened with an optional `sources` input:
 * when present, it reads each declared source's vendored copy through
 * `ctx.fs`, validates it, merges its resource-scoped decisions beside the
 * local ones, and reports `scope: 'federated'` with one `sources[]` entry per
 * declared source. A missing, invalid, or wrong-pin vendored copy stops the
 * whole verdict — naming the source — never a silent skip (FR-008).
 */

const NOW = new Date('2026-09-18T00:00:00.000Z');
const OWNER = 'acme/payments';
const CONSUMER = 'acme/reconciliation-service';

const OWNER_DECISION: GovernanceDecision = {
  id: 'D-003',
  specId: '002-ledger',
  status: 'accepted',
  posture: 'block',
  paths: [],
  modules: [],
  resource: {
    coordinate: 'spectastic://acme/payments/datastore/ledger',
    owner: OWNER,
    allowedIn: 'src/**/persistence/**',
  },
  reason: 'Every ledger write must emit LedgerPosted.',
  title: 'D-003 — only payments writes the ledger',
  enforcement: { rules: [{ tool: 'native-content', id: 'no_ledger_write', pattern: 'UPDATE\\s+ledger' }] },
};

const VENDORED_PATH = '.spectastic/decisions/acme--payments.json';

function indexTextFor(decisions: GovernanceDecision[], project = OWNER): string {
  const index = buildIndex(decisions, project, NOW);
  return `${JSON.stringify(index, null, 2)}\n`;
}

/** In-memory FileSystem keyed by path suffix — mirrors verify.test.ts's memFs. */
function memFs(files: Record<string, string>): FileSystem {
  const find = (p: string): string | undefined => {
    const key = Object.keys(files).find((k) => p.endsWith(k));
    return key ? files[key] : undefined;
  };
  return {
    readFile: async (p) => {
      const v = find(p);
      if (v === undefined) throw new Error(`ENOENT: ${p}`);
      return v;
    },
    writeFile: async () => undefined,
    readdir: async () => [],
    stat: async () => ({ isFile: true, isDirectory: false }),
    rename: async () => undefined,
  };
}

const OFFENDING_FILE = 'src/recon/Job.java';
const files: Record<string, string> = {
  [OFFENDING_FILE]: 'void run() {\n  db.exec("UPDATE ledger SET qty=0");\n}',
};

function ctxFor(vendoredText: string | undefined): KernelContext {
  const fsFiles: Record<string, string> = { ...files };
  if (vendoredText !== undefined) fsFiles[VENDORED_PATH] = vendoredText;
  return { cwd: '/consumer', fs: memFs(fsFiles) };
}

describe('verdictCommand — no sources declared (unchanged behaviour)', () => {
  it('stays scope: repo-local with no sources field', async () => {
    const result = await verdictCommand(
      { changed: [OFFENDING_FILE], now: NOW, decisions: [], currentProject: CONSUMER },
      ctxFor(undefined),
    );
    expect(result.verdict.scope).toBe('repo-local');
    expect(result.verdict.sources).toBeUndefined();
  });
});

describe('verdictCommand — a declared source with a valid vendored copy', () => {
  it('reports scope federated with one sources[] entry and merges the foreign decision', async () => {
    const text = indexTextFor([OWNER_DECISION]);
    const result = await verdictCommand(
      {
        changed: [OFFENDING_FILE],
        now: NOW,
        decisions: [],
        currentProject: CONSUMER,
        sources: [{ project: OWNER, from: './owner' }],
      },
      ctxFor(text),
    );
    expect(result.verdict.scope).toBe('federated');
    expect(result.verdict.sources).toHaveLength(1);
    expect(result.verdict.sources?.[0]).toMatchObject({
      project: OWNER,
      from: './owner',
      decisionsEvaluated: 1,
      decisionsIgnored: 0,
      decisionsRefused: 0,
    });
    // The foreign resource-scoped decision flags the consumer's touch as an
    // ownership violation — the consumer is never the owner (119/120).
    expect(result.hasViolation).toBe(true);
    expect(result.verdict.violations[0]?.cause).toBe('ownership');
    expect(result.verdict.violations[0]?.owner).toBe(OWNER);
  });

  it('keeps the top-level decisionsEvaluated meaning local-only (FR-007)', async () => {
    const text = indexTextFor([OWNER_DECISION]);
    const localDecision: GovernanceDecision = {
      id: 'D-001',
      specId: '001-local',
      status: 'accepted',
      paths: ['src/**'],
      modules: [],
      reason: 'a local decision',
    };
    const result = await verdictCommand(
      {
        changed: [OFFENDING_FILE],
        now: NOW,
        decisions: [localDecision],
        currentProject: CONSUMER,
        sources: [{ project: OWNER, from: './owner' }],
      },
      ctxFor(text),
    );
    // One LOCAL accepted decision — the foreign one must not inflate this count.
    expect(result.verdict.decisionsEvaluated).toBe(1);
  });

  it('a foreign decision with only path/module scope is ignored, not merged', async () => {
    const pathOnly: GovernanceDecision = {
      id: 'D-004',
      specId: '002-ledger',
      status: 'accepted',
      paths: ['src/**/api/**'],
      modules: [],
      reason: 'API handlers never touch storage.',
    };
    const text = indexTextFor([pathOnly]);
    const result = await verdictCommand(
      {
        changed: [OFFENDING_FILE],
        now: NOW,
        decisions: [],
        currentProject: CONSUMER,
        sources: [{ project: OWNER, from: './owner' }],
      },
      ctxFor(text),
    );
    expect(result.verdict.sources?.[0]).toMatchObject({ decisionsEvaluated: 0, decisionsIgnored: 1 });
    expect(result.hasViolation).toBe(false);
  });
});

describe('verdictCommand — FR-008 fail-closed: stop the verdict, name the source', () => {
  it('a missing vendored copy throws naming the source', async () => {
    await expect(
      verdictCommand(
        {
          changed: [OFFENDING_FILE],
          now: NOW,
          decisions: [],
          currentProject: CONSUMER,
          sources: [{ project: OWNER, from: './owner' }],
        },
        ctxFor(undefined),
      ),
    ).rejects.toThrow(/acme\/payments/);
  });

  it('a vendored copy that fails validation (bad schema) throws naming the source', async () => {
    await expect(
      verdictCommand(
        {
          changed: [OFFENDING_FILE],
          now: NOW,
          decisions: [],
          currentProject: CONSUMER,
          sources: [{ project: OWNER, from: './owner' }],
        },
        ctxFor('{"schema":"not-a-real-schema"}'),
      ),
    ).rejects.toThrow(/acme\/payments/);
  });

  it('a vendored copy for the wrong project throws naming the source', async () => {
    const wrongProjectText = indexTextFor([OWNER_DECISION], 'someone-else/other');
    await expect(
      verdictCommand(
        {
          changed: [OFFENDING_FILE],
          now: NOW,
          decisions: [],
          currentProject: CONSUMER,
          sources: [{ project: OWNER, from: './owner' }],
        },
        ctxFor(wrongProjectText),
      ),
    ).rejects.toThrow(/acme\/payments/);
  });

  it('a vendored copy disagreeing with its recorded pin throws naming the source', async () => {
    const text = indexTextFor([OWNER_DECISION]);
    await expect(
      verdictCommand(
        {
          changed: [OFFENDING_FILE],
          now: NOW,
          decisions: [],
          currentProject: CONSUMER,
          sources: [
            {
              project: OWNER,
              from: './owner',
              pin: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
            },
          ],
        },
        ctxFor(text),
      ),
    ).rejects.toThrow(/acme\/payments/);
  });

  it('a vendored copy matching its recorded pin succeeds', async () => {
    const index = buildIndex([OWNER_DECISION], OWNER, NOW);
    const text = `${JSON.stringify(index, null, 2)}\n`;
    const result = await verdictCommand(
      {
        changed: [OFFENDING_FILE],
        now: NOW,
        decisions: [],
        currentProject: CONSUMER,
        sources: [{ project: OWNER, from: './owner', pin: index.contentHash }],
      },
      ctxFor(text),
    );
    expect(result.verdict.scope).toBe('federated');
  });
});
