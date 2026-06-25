import { readFile, stat, readdir } from 'node:fs/promises';
import * as path from 'node:path';
import { extractHealth, validate, validateMany, type ArtifactHealth } from '@spectastic/schema';
import {
  VERB_ORDER,
  type ArtifactNode,
  type Edge,
  type LifecycleGraph,
  type VerbType,
} from './messaging.js';
import { flagStale, type MtimeItem } from './stale.js';

export interface ScanContext {
  specId: string;
  /** specs/<id> */
  specDir: string;
  /** specs/ */
  specsRoot: string;
  /** workspace root (holds the shared principles.html). */
  workspaceRoot: string;
}

interface Candidate {
  verb: VerbType;
  path: string;
}

/** Map each verb to the file that backs it in this repo's layout. */
function candidates(ctx: ScanContext): Candidate[] {
  return [
    { verb: 'principles', path: path.join(ctx.workspaceRoot, 'principles.html') },
    { verb: 'spec', path: path.join(ctx.specDir, 'spec.html') },
    { verb: 'plan', path: path.join(ctx.specDir, 'plan.html') },
    { verb: 'tasks', path: path.join(ctx.specDir, 'tasks.html') },
    { verb: 'propose', path: path.join(ctx.specDir, 'proposal.html') },
    { verb: 'triage', path: path.join(ctx.specDir, 'triage-log.html') },
  ];
}

/** List spec ids (directories under specs/ that contain a spec.html). */
export async function listSpecs(specsRoot: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(specsRoot);
  } catch {
    return [];
  }
  const ids: string[] = [];
  for (const name of entries) {
    if (await fileExists(path.join(specsRoot, name, 'spec.html'))) ids.push(name);
  }
  return ids.sort();
}

/**
 * Build the LifecycleGraph for one spec by scanning + parsing its artifacts
 * (spec FR-001, FR-010). Never writes; safe to call on every change.
 */
export async function buildGraph(ctx: ScanContext): Promise<LifecycleGraph> {
  const nodes: ArtifactNode[] = [];
  const edges: Edge[] = [];
  const mtimeItems: MtimeItem[] = [];

  // Spine: one node per existing candidate file, in verb order.
  const present: Candidate[] = [];
  for (const c of candidates(ctx)) {
    if (await fileExists(c.path)) present.push(c);
  }

  for (const c of present) {
    const node = await buildNode(c.verb, c.verb, ctx.specId, c.path);
    nodes.push(node);
    const mtimeMs = await mtimeOf(c.path);
    mtimeItems.push({ id: node.id, orderIndex: VERB_ORDER.indexOf(c.verb), mtimeMs });
  }

  // Flow edges between consecutive spine nodes.
  for (let i = 0; i < present.length - 1; i++) {
    const from = present[i];
    const to = present[i + 1];
    if (from && to) {
      const kind = to.verb === 'propose' ? 'proposal' : 'flow';
      edges.push({ from: from.verb, to: to.verb, kind });
    }
  }

  // Child slices: sibling specs whose spec.html names this spec as parent.
  for (const childId of await childSlices(ctx)) {
    const childPath = path.join(ctx.specsRoot, childId, 'spec.html');
    const node = await buildNode('spec', `slice:${childId}`, childId, childPath);
    nodes.push(node);
    edges.push({ from: 'spec', to: node.id, kind: 'slice' });
  }

  // Derived views (e.g. verify.html) — statusless, branch off the spine (FR-014, D-008).
  await appendDerivedView(ctx, present, nodes, edges);

  // Staleness across the spine. Derived nodes carry their own freshness signal.
  const stale = flagStale(mtimeItems);
  for (const node of nodes) {
    if (!node.derived) node.stale = stale.has(node.id);
  }

  return { specId: ctx.specId, nodes, edges };
}

/** Append the verify.html derived-view node + its edge off the spine source. */
async function appendDerivedView(
  ctx: ScanContext,
  present: Candidate[],
  nodes: ArtifactNode[],
  edges: Edge[],
): Promise<void> {
  const verifyPath = path.join(ctx.specDir, 'verify.html');
  if (!(await fileExists(verifyPath))) return;
  nodes.push(await buildDerivedNode(ctx, verifyPath));
  const source =
    present.find((c) => c.verb === 'tasks') ??
    present.find((c) => c.verb === 'spec') ??
    present.at(-1);
  if (source) edges.push({ from: source.verb, to: 'verify', kind: 'derived' });
}

/**
 * Build the statusless derived-view node for verify.html (FR-014 / D-008). Its
 * metric is a binary stale flag off the verify-view-stale rule (021 FR-008).
 */
async function buildDerivedNode(ctx: ScanContext, filePath: string): Promise<ArtifactNode> {
  const stale = await verifyStale(ctx);
  return {
    id: 'verify',
    // verb is unused for a derived node (no pill, no verb colour); a valid
    // placeholder keeps the type honest.
    verb: 'spec',
    specId: ctx.specId,
    title: ctx.specId,
    path: filePath,
    health: emptyHealth(),
    metric: stale ? 'stale' : 'in sync',
    attention: stale,
    stale,
    unknown: false,
    derived: true,
  };
}

/** True when verify.html has drifted from its bundle (verify-view-stale, 021 FR-008). */
async function verifyStale(ctx: ScanContext): Promise<boolean> {
  const inputs: { html: string; file: string }[] = [];
  for (const name of ['spec.html', 'tasks.html', 'verify.html']) {
    try {
      inputs.push({
        html: await readFile(path.join(ctx.specDir, name), 'utf8'),
        file: `specs/${ctx.specId}/${name}`,
      });
    } catch {
      // missing sibling — the rule simply has less to compare.
    }
  }
  return validateMany(inputs).some((f) => f.rule === 'verify-view-stale');
}

async function buildNode(
  verb: VerbType,
  id: string,
  specId: string,
  filePath: string,
): Promise<ArtifactNode> {
  try {
    const html = await readFile(filePath, 'utf8');
    const health = extractHealth(html);
    const regenFailed = validate(html, { file: filePath }).some((f) => f.severity === 'error');
    return {
      id,
      verb,
      specId,
      title: specId,
      path: filePath,
      health,
      metric: metricFor(verb, health),
      attention: hasAttention(health, regenFailed),
      stale: false,
      unknown: false,
    };
  } catch {
    return {
      id,
      verb,
      specId,
      title: specId,
      path: filePath,
      health: emptyHealth(),
      metric: 'unknown',
      attention: true,
      stale: false,
      unknown: true,
    };
  }
}

function metricFor(verb: VerbType, health: ArtifactHealth): string {
  if (verb === 'spec') return `${health.reqCount} reqs`;
  return health.status ?? '—';
}

/** A node needs attention when any FR-006 signal has fired. */
function hasAttention(health: ArtifactHealth, regenFailed: boolean): boolean {
  return (
    health.budgetBand === 'red' ||
    health.openQuestions > 0 ||
    health.status === 'blocked' ||
    health.risksIdentified > 0 ||
    regenFailed
  );
}

async function childSlices(ctx: ScanContext): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(ctx.specsRoot);
  } catch {
    return [];
  }
  const children: string[] = [];
  const marker = new RegExp(`<spec-parent[^>]*specid="${ctx.specId}"`);
  for (const name of entries) {
    if (name === ctx.specId) continue;
    const sibling = path.join(ctx.specsRoot, name, 'spec.html');
    try {
      const html = await readFile(sibling, 'utf8');
      if (marker.test(html)) children.push(name);
    } catch {
      // not a spec dir, or unreadable — skip.
    }
  }
  return children.sort();
}

function emptyHealth(): ArtifactHealth {
  return {
    status: null,
    reqCounts: null,
    reqCount: 0,
    wordCount: 0,
    readMinutes: 0,
    openQuestions: 0,
    risksIdentified: 0,
    budgetBand: null,
  };
}

async function fileExists(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

async function mtimeOf(p: string): Promise<number> {
  try {
    return (await stat(p)).mtimeMs;
  } catch {
    return 0;
  }
}
