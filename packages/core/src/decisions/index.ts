/**
 * The decision index — build (owner side) and validate (any reader) (spec
 * 122-decision-index-federation, D-001/D-003). Pure: no filesystem, no
 * network. Built from decisions already loaded by `commands/adrs.ts`;
 * validated against the fail-closed reject list a consumer or the sibling
 * MCP server both enforce.
 */

import { classifyProjectId, decisionResourceUri } from '@spectastic/schema/project';
import { contentHashOf } from './canonical.js';
import type { GovernanceDecision } from '../guardrail/types.js';

export interface IndexedRule {
  tool: string;
  id: string;
  pattern?: string;
  deny?: string;
  allowedIn?: string;
}

/** The `GovernanceDecision` shape minus `prose` and `enforcement.rules[].run`,
 *  plus its minted coordinate — what travels in a decision index. */
export interface IndexedDecision {
  coordinate: string;
  id: string;
  specId: string;
  status: 'accepted';
  posture?: 'warn' | 'block';
  paths: string[];
  modules: string[];
  resource?: { coordinate: string; owner: string; allowedIn?: string };
  supersedes?: string;
  reviewBy?: string;
  reason?: string;
  title?: string;
  enforcement?: { rules: IndexedRule[] };
}

/** The committed `specs/decisions.json` shape. */
export interface DecisionIndex {
  schema: 'spectastic-decision-index/1';
  project: string;
  generatedAt: string;
  generator?: string;
  contentHash: string;
  decisions: IndexedDecision[];
}

const SCHEMA = 'spectastic-decision-index/1' as const;

function isScoped(d: GovernanceDecision): boolean {
  return d.paths.length > 0 || d.modules.length > 0 || d.resource !== undefined;
}

/** `run` is deliberately never copied — owner-local orchestration never
 *  crosses a repository boundary (spec FR-001 rationale, P-11). */
function stripRun(rule: {
  tool: string;
  id: string;
  pattern?: string;
  deny?: string;
  allowedIn?: string;
}): IndexedRule {
  const out: IndexedRule = { tool: rule.tool, id: rule.id };
  if (rule.pattern !== undefined) out.pattern = rule.pattern;
  if (rule.deny !== undefined) out.deny = rule.deny;
  if (rule.allowedIn !== undefined) out.allowedIn = rule.allowedIn;
  return out;
}

/** Strip `prose` and every rule's `run`; mint the coordinate. */
function toIndexed(d: GovernanceDecision, project: string): IndexedDecision {
  const out: IndexedDecision = {
    coordinate: decisionResourceUri(project, d.specId, d.id),
    id: d.id,
    specId: d.specId,
    status: 'accepted',
    paths: d.paths,
    modules: d.modules,
  };
  if (d.posture !== undefined) out.posture = d.posture;
  if (d.resource !== undefined) out.resource = { ...d.resource };
  if (d.supersedes !== undefined) out.supersedes = d.supersedes;
  if (d.reviewBy !== undefined) out.reviewBy = d.reviewBy;
  if (d.reason !== undefined) out.reason = d.reason;
  if (d.title !== undefined) out.title = d.title;
  if (d.enforcement !== undefined) out.enforcement = { rules: d.enforcement.rules.map(stripRun) };
  return out;
}

/** Build an index from a project's loaded decisions (spec FR-001): filters to
 *  accepted decisions carrying a path, module or resource scope; strips
 *  `prose` and any rule's `run`; sorts by `(specId, id)`; hashes the result.
 *  Throws when `project` is not owner-qualified. */
export function buildIndex(decisions: readonly GovernanceDecision[], project: string, now: Date): DecisionIndex {
  if (classifyProjectId(project) !== 'owner-qualified') {
    throw new Error(
      `decisions export: project "${project}" is not owner-qualified — cannot federate as a bare identity.`,
    );
  }
  const indexed = decisions
    .filter((d) => d.status === 'accepted' && isScoped(d))
    .map((d) => toIndexed(d, project))
    .sort((a, b) => a.specId.localeCompare(b.specId) || a.id.localeCompare(b.id));
  return {
    schema: SCHEMA,
    project,
    generatedAt: now.toISOString(),
    contentHash: contentHashOf(indexed),
    decisions: indexed,
  };
}

export type ValidateIndexResult = { ok: true; index: DecisionIndex } | { ok: false; reason: string };

function fail(reason: string): ValidateIndexResult {
  return { ok: false, reason };
}

/** The reject reason for one decision entry, or `null` when it passes (spec
 *  FR-005). Split out of `validateIndex` to keep both functions' branching
 *  shallow. */
function decisionRejectReason(raw: unknown, project: string): string | null {
  if (typeof raw !== 'object' || raw === null) return 'a decision is not an object';
  const d = raw as Record<string, unknown>;
  const label = `${String(d.specId)}/${String(d.id)}`;
  if (d.status !== 'accepted') return `decision "${label}" is not accepted`;
  if (typeof d.id !== 'string' || d.id === '') return 'a decision is missing its id';
  if (typeof d.specId !== 'string' || d.specId === '') return `decision "${label}" is missing its specId`;
  if (typeof d.coordinate !== 'string' || d.coordinate === '') return `decision "${label}" is missing its coordinate`;
  if (d.coordinate !== decisionResourceUri(project, d.specId, d.id)) {
    return `decision "${label}" carries a coordinate that disagrees with its ids`;
  }
  if (d.resource !== undefined) {
    const owner = (d.resource as Record<string, unknown>).owner;
    if (owner !== project)
      return `decision "${label}" claims a store owner "${String(owner)}" other than this index's own project`;
  }
  return null;
}

/** Validate a decision index's text against the fail-closed reject list
 *  (spec FR-005): unknown schema; project absent/not owner-qualified/not the
 *  expected one; missing or mismatched content hash; any decision not
 *  accepted or missing an id/specId/coordinate, or whose coordinate
 *  disagrees with them; any resource owner not the index's own project. */
export function validateIndex(text: string, expectedProject: string): ValidateIndexResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return fail('not a JSON object');
  const obj = parsed as Record<string, unknown>;

  if (obj.schema !== SCHEMA) return fail(`unknown schema "${JSON.stringify(obj.schema)}"`);

  const project = obj.project;
  if (typeof project !== 'string' || classifyProjectId(project) !== 'owner-qualified') {
    return fail('project is absent or not owner-qualified');
  }
  if (project !== expectedProject) {
    return fail(`index project "${project}" does not match the expected "${expectedProject}"`);
  }

  const decisions = obj.decisions;
  if (!Array.isArray(decisions)) return fail('decisions is not an array');

  for (const raw of decisions) {
    const reason = decisionRejectReason(raw, project);
    if (reason !== null) return fail(reason);
  }

  if (obj.contentHash !== contentHashOf(decisions))
    return fail('contentHash is missing or disagrees with the decisions');

  return { ok: true, index: parsed as DecisionIndex };
}
