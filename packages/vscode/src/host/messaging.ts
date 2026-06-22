import type { ArtifactHealth } from '@spectastic/schema';

/**
 * Shared model + message protocol between the extension host and the canvas
 * webview (plan §6). Imported by both sides; `ArtifactHealth` is a type-only
 * import so the webview bundle carries no schema runtime.
 */

/** The eight lifecycle verbs, in canonical L→R order (spec FR-001). */
export const VERB_ORDER = [
  'principles',
  'spec',
  'plan',
  'tasks',
  'implement',
  'propose',
  'apply',
  'triage',
] as const;

export type VerbType = (typeof VERB_ORDER)[number];

/**
 * Per-verb brand colour token, fixed by 017-brand-logo (the asterisk's prongs).
 * The order MUST NOT be shuffled, recoloured, or dropped (spec FR-002).
 */
export const VERB_TOKEN: Record<VerbType, string> = {
  principles: '--spec-1',
  spec: '--spec-2',
  plan: '--spec-3',
  tasks: '--spec-4',
  implement: '--spec-5',
  propose: '--spec-6',
  apply: '--spec-7',
  triage: '--spec-8',
};

/** Canvas layout orientation (spec FR-004). Vertical is the default. */
export type Orientation = 'vertical' | 'horizontal';

export type EdgeKind = 'flow' | 'slice' | 'proposal';

export interface Edge {
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface ArtifactNode {
  /** Stable id within the graph (the verb for spine nodes). */
  id: string;
  verb: VerbType;
  specId: string;
  /** Display title (spec id / name). */
  title: string;
  /** Absolute path to the artifact file. */
  path: string;
  /** Parsed health (null reqCounts/budgetBand for non-spec verbs). */
  health: ArtifactHealth;
  /** The single key metric shown at minimal fidelity. */
  metric: string;
  /** Needs-attention: a signal has fired (spec FR-006). */
  attention: boolean;
  /** Stale: predates an upstream change (spec FR-007). */
  stale: boolean;
  /** Unknown: the artifact could not be parsed (spec FR-011). */
  unknown: boolean;
}

export interface LifecycleGraph {
  specId: string;
  nodes: ArtifactNode[];
  edges: Edge[];
}

/** Host → webview. */
export type HostMessage =
  | { type: 'graph'; graph: LifecycleGraph; orientation?: Orientation }
  | { type: 'patch'; node: ArtifactNode }
  | { type: 'empty'; reason: string };

/** Webview → host. */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'open'; path: string };
