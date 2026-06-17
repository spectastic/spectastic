/**
 * @spectastic/core public types.
 *
 * Per D-003..D-005 of specs/006-kernel-extraction/plan.html, the kernel's
 * surface is three interfaces (KernelContext, FileSystem, AIProvider) +
 * per-verb input/result shapes. The AIProvider is forward-looking
 * (declares chat + ask + subagent in v1 even though the validate verb
 * needs none of them) so 007's first implementation and 013's adversarial
 * pass are additive PRs rather than interface-extending breaking changes.
 *
 * Re-exports Finding from @spectastic/schema so consumers see one source
 * of truth for the validator's wire format.
 */

import type { Finding } from '@spectastic/schema';
export type { Finding };

// --- IO ----------------------------------------------------------------

/**
 * Minimal filesystem interface kernel functions use for IO. Maps cleanly
 * to node:fs/promises (default), VS Code's workspace.fs, MCP server file
 * capabilities, and in-memory test stubs.
 */
export interface FileSystem {
  readFile(path: string, encoding?: 'utf8'): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<{ isFile: boolean; isDirectory: boolean }>;
  /** Atomic move; added in 010-core-apply per its plan D-003. */
  rename(from: string, to: string): Promise<void>;
}

// --- AI ----------------------------------------------------------------

/**
 * Options for AIProvider.chat(). Optional and forward-looking — providers
 * are free to ignore unknown keys.
 */
export interface ChatOpts {
  /** Model identifier; provider-specific. */
  model?: string;
  /** Hard cap on response length. */
  maxTokens?: number;
  /** Sampling temperature; 0 = deterministic. */
  temperature?: number;
  /** Optional system prompt. */
  system?: string;
}

/**
 * One question in an AIProvider.ask<T>() batch. Mirrors AskUserQuestion's
 * shape exactly so the Claude provider can route the call straight
 * through; MCP / VS Code adapters render the choices in their own UI.
 */
export interface Question<TValue extends string = string> {
  question: string;
  header: string;
  multiSelect?: boolean;
  options: ReadonlyArray<{
    label: TValue;
    description: string;
    preview?: string;
  }>;
}

/**
 * Options for AIProvider.subagent(). Provisional shape — the concrete
 * surface gets nailed down when 013-core-propose actually implements
 * the adversarial pass.
 */
export interface SubagentOpts {
  /** Short label for telemetry / the user. */
  task?: string;
  /** Optional model override. */
  model?: string;
}

/**
 * Subagent invocation result. Provisional alongside SubagentOpts.
 */
export interface SubagentResult {
  /** The subagent's textual response. */
  output: string;
  /** Optional structured output if the subagent emitted JSON. */
  structured?: unknown;
}

/**
 * Pluggable AI provider injected via KernelContext. Defined in v1 even
 * though validate doesn't use it; 007 lands the first Claude
 * implementation; 013 wires up subagent().
 */
export interface AIProvider {
  /** Freeform model invocation. */
  chat(prompt: string, opts?: ChatOpts): Promise<string>;
  /** Typed bounded-choice prompt. */
  ask<TResult extends Record<string, string>>(
    questions: ReadonlyArray<Question>,
  ): Promise<TResult>;
  /** Spawn a critic / specialized sub-agent. */
  subagent(prompt: string, opts?: SubagentOpts): Promise<SubagentResult>;
}

// --- Kernel context ----------------------------------------------------

/**
 * The single object every kernel function takes alongside its input.
 * Per D-003: cwd required (no implicit process.cwd()); fs + ai optional.
 * Verbs that don't need AI leave ai undefined; verbs that don't need IO
 * leave fs undefined.
 */
export interface KernelContext {
  /** Directory to resolve relative paths against. */
  cwd: string;
  /** Filesystem access; defaults to the nodeFs wrapper if undefined. */
  fs?: FileSystem;
  /** AI provider; undefined for deterministic verbs like validate. */
  ai?: AIProvider;
}

// --- Per-verb shapes ---------------------------------------------------

/**
 * Input to validateCommand. Paths are already-resolved file paths; glob
 * expansion is the caller's concern (per D-006).
 */
export interface ValidateInput {
  /** Already-resolved file paths to validate. */
  files: ReadonlyArray<string>;
}

/**
 * Result of validateCommand. The CLI translates this into stdout output
 * + process exit code; MCP / VS Code consumers render findings directly.
 */
export interface ValidateResult {
  /** Every finding the engine produced, across every file. */
  findings: ReadonlyArray<Finding>;
  /** 0 = clean, 1 = at least one error finding, 2 = read / usage error. */
  exitCode: 0 | 1 | 2;
  /** The files actually read + validated (subset of input.files). */
  filesValidated: ReadonlyArray<string>;
  /** Optional message for callers that surface usage errors. */
  errorMessage?: string;
}

// --- triage ------------------------------------------------------------

/** Eight layer values per FR-009 of 007-core-triage. */
export type TriageLayer =
  | 'spec'
  | 'plan'
  | 'implementation'
  | 'cross-spec'
  | 'principles'
  | 'platform'
  | 'just-do'
  | 'defer';

/** Input to triageCommand. */
export interface TriageInput {
  /** Raw user input — single failure description, error, stack, or list. */
  description: string;
  /** When set, caller's mode wins; when undefined, kernel detects via heuristic. */
  mode?: 'single' | 'list';
  /** Required for single-card mode; ignored in list-intake. */
  specId?: string;
  /** Highest existing T-NNN in the destination triage-log (caller scans). */
  startingIdT?: number;
  /** Highest existing I-NNN in the destination inbox (caller scans). */
  startingIdI?: number;
}

/** One produced triage card. */
export interface TriageCard {
  /** Sequential ID assigned by the kernel from caller-supplied starting points. */
  id: string;
  /** Layer classification per FR-009. */
  layer: TriageLayer;
  /** One-line failure title. */
  headline: string;
  /** Single-sentence expected. */
  expected: string;
  /** Single-sentence actual. */
  actual: string;
  /** Single-sentence root cause; may cite REQ IDs. */
  diagnosis: string;
  /** Artifact path + one-line proposal. */
  fix: string;
  /** Omitted for routing-exit layers (just-do, defer). */
  regenResult?: 'pass' | 'fail' | 'unsure';
  /** Only when layer === 'defer'. */
  deferTo?: string;
  /** Optional deep-dive prose for cascade / cross-spec / principles. */
  deepDive?: string;
}

/** Result of triageCommand. Caller decides where to persist each card. */
export interface TriageResult {
  /** One card for single-card mode; N for list-intake. */
  cards: ReadonlyArray<TriageCard>;
}

// --- principles --------------------------------------------------------

/** Input to principlesCommand. Per 008 D-003: all-optional. */
export interface PrinciplesInput {
  /** Project name; if undefined, kernel interviews via ai.ask<T>(). */
  projectName?: string;
  /** One-line tagline; if undefined, kernel asks. */
  tagline?: string;
  /** Target principle count; defaults to 5. */
  principlesCount?: number;
  /** Optional context to ground the principles in (existing code, vision doc, etc.). */
  context?: string;
}

/** Result of principlesCommand. Caller writes html to disk. */
export interface PrinciplesResult {
  /** The rendered principles.html content. */
  html: string;
  /** How many principles the kernel actually generated. */
  principlesCount: number;
}

// --- tasks (the verb that generates tasks.html) ------------------------

export interface TasksInput {
  /** Path to the source spec.html (resolved). */
  specPath: string;
  /** Path to the source plan.html (resolved). */
  planPath: string;
}

export interface TaskItem {
  id: string;
  title: string;
  path?: string;
  parallel: boolean;
}

export interface TaskPhase {
  id: 'setup' | 'foundation' | 'us1' | 'us2' | 'us3' | 'polish';
  title: string;
  tasks: TaskItem[];
}

export interface TasksResult {
  html: string;
  phases: TaskPhase[];
  totalTasks: number;
  parallelTasks: number;
}

// --- apply (verb 010) --------------------------------------------------

export interface ApplyInput {
  kind: 'apply';
  /** Spec ID owning the change folder, e.g. "001-auth". */
  specId: string;
  /** Slug like "2026-06-16-add-oauth"; resolves to changes/<slug>/. */
  slug: string;
}

export interface WithdrawInput {
  kind: 'withdraw';
  specId: string;
  slug: string;
  reason: string;
}

export interface DeltaApplication {
  target: string;
  op: 'added' | 'modified' | 'removed' | 'renamed';
  result: 'success' | 'gate-blocked';
  reason?: string;
}

export interface ApplyResult {
  /** Path to the live spec.html (post-mutation). */
  liveSpec: string;
  /** Where the proposal folder ended up. */
  archivedPath: string;
  /** One per <spec-delta> applied. */
  deltas: DeltaApplication[];
  /** New entry appended to the live spec's changelog. */
  changelogEntry: string;
  /** Cross-spec references the apply touched but didn't rewrite; surfaced for follow-up. */
  crossSpecWarnings: string[];
}

// --- spec (verb 011) + plan (verb 012) ---------------------------------

export interface SpecInput {
  /** Feature name or one-line description. */
  description: string;
  /** When set, the kernel runs in re-entry mode against the existing spec. */
  specId?: string;
  /** Existing spec.html content (for re-entry); caller reads it. */
  existingSpec?: string;
}

export interface SpecResult {
  /** Generated or sharpened spec.html content. */
  html: string;
  /** The chosen spec ID. */
  specId: string;
  /** How many requirements the kernel ended up authoring (FR + NFR + SC). */
  requirementsCount: number;
  /** Any soft warnings (over-budget, INVEST gaps, etc.). */
  warnings: string[];
}

export interface PlanInput {
  /** Spec ID to plan against. */
  specId: string;
  /** Existing spec.html content (kernel reads). */
  specHtml: string;
  /** Existing plan.html content (for re-entry; undefined = fresh). */
  existingPlan?: string;
  /** Existing principles.html content (for the principles check). */
  principlesHtml?: string;
}

export interface PlanResult {
  html: string;
  decisionsCount: number;
  estimabilityBlockers: string[];
  principlesCheck: {
    ok: number;
    exceptions: number;
    violations: number;
  };
}

// --- propose (verb 013) ------------------------------------------------

export interface Delta {
  op: 'added' | 'modified' | 'removed' | 'renamed';
  target: string;
  postState?: string;
  reason?: string;
  migration?: string;
}

export interface RiskFinding {
  target: string;
  status: 'identified' | 'accepted' | 'mitigated' | 'rejected' | 'no-value-found';
  concern: string;
  response?: string;
}

export interface ProposeInput {
  specId: string;
  description: string;
  specHtml: string;
  adversarial?: boolean | 'auto';
}

export interface ProposeResult {
  html: string;
  deltasCount: number;
  risks: RiskFinding[];
}

// --- implement (verb 014, single-task mode) ----------------------------

export interface ImplementInput {
  /** T-NNN, I-NNN, or spec-id. */
  target: string;
  /** Source spec.html content (for estimability gate). */
  specHtml?: string;
  /** Source plan.html content. */
  planHtml?: string;
  /** Source tasks.html content (for tick + remaining count). */
  tasksHtml?: string;
  /** Source inbox.html content (for just-do cards). */
  inboxHtml?: string;
}

export interface ImplementResult {
  /** What got ticked (single in v0.1; `ticks` field reserved for drain modes). */
  ticked: { kind: 'task' | 'just-do'; id: string; file: string };
  /** Reserved for the carved-out drain modes. */
  ticks?: ReadonlyArray<{ kind: 'task' | 'just-do'; id: string; file: string }>;
  /** Number of unchecked checkboxes remaining in the target tasks.html. */
  remainingUnchecked: number;
  /** True if the bundled flip prompt was surfaced (last-tick + Draft). */
  flipPromptFired: boolean;
}
