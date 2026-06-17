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
