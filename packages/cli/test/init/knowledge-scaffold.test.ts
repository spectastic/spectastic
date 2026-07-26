import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { corpusWellFormedFindings, loadCorpus } from '@spectastic/core/knowledge';
import { resolveBundle } from '../../src/commands/init/bundle.js';
import { buildPlan } from '../../src/commands/init/plan.js';
import { executeWrites } from '../../src/commands/init/write.js';

/**
 * 051-knowledge-corpus T-200: red-first test for the init-time corpus
 * scaffold (FR-006, SC-002) — a fresh `spectastic init` writes a real,
 * immediately usable `knowledge/` directory at project root (not nested
 * inside `templates/`, which every other bundled template is), and that
 * scaffold validates with zero corpus-well-formed findings.
 */
describe('init: knowledge corpus scaffold (051 T-200, FR-006/SC-002)', () => {
  it('writes knowledge/ at project root — not nested inside templates/', async () => {
    const inventory = resolveBundle();
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-init-knowledge-'));
    const plan = buildPlan({ inventory, cwd });
    await executeWrites(plan);

    const destinations = plan.map((d) => d.destination.slice(cwd.length + 1));
    expect(destinations.some((d) => d.startsWith('knowledge/'))).toBe(true);
    expect(destinations.some((d) => d.startsWith('templates/knowledge/'))).toBe(false);
  });

  it('the written scaffold passes corpusWellFormedFindings with zero findings', async () => {
    const inventory = resolveBundle();
    const cwd = mkdtempSync(join(tmpdir(), 'spectastic-init-knowledge-'));
    const plan = buildPlan({ inventory, cwd });
    await executeWrites(plan);

    const packs = loadCorpus(cwd);
    expect(packs.length).toBeGreaterThan(0);
    expect(corpusWellFormedFindings(packs)).toEqual([]);
  });
});
