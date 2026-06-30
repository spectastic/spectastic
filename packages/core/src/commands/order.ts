/**
 * Kernel for `spectastic order` (spec 028-dependency-ordering). Reads the spec
 * corpus, infers the reciprocity DAG, ranks by RICE with foundation elevation,
 * and emits one `Ordering` model projected two ways (FR-007): a machine-readable
 * spec-id list (for callers like the future W-2 slicer) and a self-contained
 * roadmap.html. Deterministic and AI-free — no `createAIProvider()`.
 *
 * Read-only over the corpus (FR-009): it reads `specs/<id>/spec.html` through
 * `ctx.fs` and returns the rendered html for the CLI to write. Throws
 * {@link CycleError} on a precedence cycle (FR-005).
 */

import { join } from 'node:path';
import { buildGraph } from '../ordering/graph.js';
import { scoreNodes } from '../ordering/score.js';
import { topoOrder } from '../ordering/topo.js';
import { applyWsjf, renderRoadmapHtml } from './order.render.js';
import type { CorpusEntry, Ordering } from '../ordering/types.js';
import type { KernelContext } from '../types.js';

export { renderRoadmapHtml, applyWsjf } from './order.render.js';
export { CycleError } from '../ordering/types.js';
export type { Ordering, RankedNode } from '../ordering/types.js';

export interface OrderInput {
  /** Pre-read corpus to order. When omitted, the kernel reads `specs/` via ctx.fs. */
  corpus?: CorpusEntry[];
  /** Asset-link prefix for the rendered view; depends on the output location. */
  assetsPrefix?: string;
}

export interface OrderResult {
  /** The ordered spec ids, top of the build order first. */
  ids: string[];
  /** The self-contained roadmap.html. */
  html: string;
  /** The full ordering model. */
  ordering: Ordering;
}

const SPEC_DIR = /^\d{3}-[a-z][a-z0-9-]*$/;

/** Read every `specs/<id>/spec.html`, sorted by id. Non-spec entries are skipped. */
async function loadCorpus(ctx: KernelContext): Promise<CorpusEntry[]> {
  const fs = ctx.fs ?? (await import('../providers/node-fs.js')).nodeFs;
  const specsDir = join(ctx.cwd, 'specs');
  const names = (await fs.readdir(specsDir)).filter((n) => SPEC_DIR.test(n)).sort();
  const corpus: CorpusEntry[] = [];
  for (const specId of names) {
    try {
      const html = await fs.readFile(join(specsDir, specId, 'spec.html'), 'utf8');
      corpus.push({ specId, html });
    } catch {
      // No spec.html under this directory — not a spec; skip.
    }
  }
  return corpus;
}

export async function orderCommand(input: OrderInput, ctx: KernelContext): Promise<OrderResult> {
  const corpus = input.corpus ?? (await loadCorpus(ctx));
  const { nodes, edges, dangling } = buildGraph(corpus);
  const scored = scoreNodes(nodes);
  const ordered = topoOrder(scored, edges); // throws CycleError on a cycle (FR-005)
  const entries = applyWsjf(ordered);
  const ordering: Ordering = { entries, dangling };
  const html = renderRoadmapHtml(ordering, { ...(input.assetsPrefix ? { assetsPrefix: input.assetsPrefix } : {}) });
  return { ids: entries.map((e) => e.specId), html, ordering };
}
