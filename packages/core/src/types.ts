/**
 * @spectastic/core public types.
 *
 * Per D-003..D-005 of specs/006-kernel-extraction/design.html, the kernel's
 * surface is three interfaces (KernelContext, FileSystem, AIProvider) +
 * per-verb input/result shapes. The AIProvider is forward-looking
 * (declares chat + ask + subagent in v1 even though the validate verb
 * needs none of them) so 007's first implementation and 013's adversarial
 * pass are additive PRs rather than interface-extending breaking changes.
 *
 * Re-exports Finding from @spectastic/schema so consumers see one source
 * of truth for the validator's wire format.
 */

import type { Finding, ParsedDocument } from '@spectastic/schema';

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
  /**
   * Recursive, force remove (no error if absent). Added in 023-explore-graduation
   * per its plan D-003: the graduation rollback deletes a partial `specs/<id>/`
   * so a failed graduation leaves no residue and retry is clean (SC-003).
   */
  rm(path: string): Promise<void>;
  /**
   * Recursive, idempotent directory create (no error if it already exists).
   * Added per REQ-CHANGE-007 / REQ-CHANGE-005: the kernel's archive and withdraw
   * moves create their destination parent (`changes/archive|withdrawn/`) before
   * `rename`, so a spec's first apply/withdraw does not ENOENT on a missing
   * directory (triage T-007).
   */
  mkdir(path: string): Promise<void>;
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
  /** The model identifier this provider invokes — the `Assisted-by` trailer
   * source (spec 027-git-trailers, D-003). A stub reports a deterministic id. */
  readonly model: string;
  /** Freeform model invocation. */
  chat(prompt: string, opts?: ChatOpts): Promise<string>;
  /** Typed bounded-choice prompt. */
  ask<TResult extends Record<string, string>>(questions: ReadonlyArray<Question>): Promise<TResult>;
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
  /**
   * Documents the caller has already read and parsed, keyed by file path.
   *
   * Optional: absent, every file is read and parsed here as before. Supplied,
   * the parse is reused rather than repeated — which matters because a CLI
   * validate run also executes a dozen scans over the same files, and each
   * parsing independently came to 1489 parses for 379 files.
   *
   * A file absent from the map is still read normally, so a partial cache is
   * safe rather than silently skipping work.
   */
  docs?: ReadonlyMap<string, { html: string; parsed: ParsedDocument }>;
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
  | 'design'
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
  /**
   * List-intake fan-out concurrency cap (spec 032-triage-fanout FR-007).
   * Default 8; ignored in single mode.
   */
  concurrency?: number;
  /**
   * Which provider method the shared classification core calls (spec 032 D-001):
   * 'chat' (default — the CLI backend) or 'subagent' (the Workflow backend).
   */
  backend?: 'chat' | 'subagent';
  /** Decider role for the hedge gate (spec 036). Absent → 'human' (parity). */
  decider?: 'human' | 'agent' | 'panel';
  /** Effort sizing a panel hedge-gate decider (spec 033/034). Absent → 'medium'. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'auto';
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
  /** Path to the source design.html (resolved). */
  planPath: string;
  /**
   * Restore mode (spec 024-explore-restore, FR-001). When set, the kernel
   * generates path-appropriate *restore* tasks for a graduated bundle instead of
   * a normal breakdown: the frozen `classification` picks the path — `tracer-bullet`
   * → refactor-to-comply (keep the build), `spike` → clean-rebuild (discard it) —
   * and `sourceArchive` is the archived exploration the banner names and the spike
   * path deletes. Absent ⇒ the normal generation path.
   */
  restore?: {
    classification: GraduationClass;
    sourceArchive: string;
  };
  /**
   * Bounded decisions already answered for this verb (spec 037 FR-005 / 039) —
   * e.g. the chosen execution strategy. Folded into the (AI) title-enrichment
   * prompt; absent ⇒ today's behaviour. The deterministic skeleton is unaffected.
   */
  decisions?: Record<string, string>;
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
  /**
   * Discoverability hint (054-corpus-in-prompt, FR-003 / D-004). Set only when
   * no `knowledge/` corpus was found for this run; the CLI shows it at most
   * once, guarded by a `.spectastic/` marker. Never set when a corpus exists.
   */
  corpusHint?: string;
}

// --- apply (verb 010) --------------------------------------------------

export interface ApplyInput {
  kind: 'apply';
  /** Spec ID owning the change folder, e.g. "001-auth". */
  specId: string;
  /** Slug like "2026-06-16-add-oauth"; resolves to changes/<slug>/. */
  slug: string;
  /**
   * Optional author-supplied one-line summary for the live-spec changelog entry
   * (REQ-CHANGE-008). When omitted, the kernel falls back to a terse delta count
   * — so the slash command can preserve the changelog's human voice by passing
   * the rich one-liner, while raw CLI use still gets a valid entry.
   */
  summary?: string;
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
  /**
   * The §6 task-fold (REQ-CHANGE-007). `null` when the proposal had no §6 tasks
   * (an empty §6 owes no phase). Apply only routes — `/spectastic.implement`
   * drains the folded phase.
   */
  foldedPhase?: {
    /** The target tracker the phase was folded into. */
    trackerPath: string;
    /** The new `<section>` id, `phase-<slug>`. */
    phaseId: string;
    /** The `T-NNN` ids assigned to the folded tasks. */
    taskIds: string[];
    /** True when the tracker did not exist and was created from the template. */
    created: boolean;
  } | null;
  /**
   * Count of contracts promoted from their spec-local proposed location to
   * their declared effective path (071-contract-promotion). 0 for the
   * overwhelming majority of changes, which touch no contract (FR-006).
   */
  promotedContracts?: number;
}

// --- spec (verb 011) + plan (verb 012) ---------------------------------

export interface SpecInput {
  /** Feature name or one-line description. */
  description: string;
  /** When set, the kernel runs in re-entry mode against the existing spec. */
  specId?: string;
  /** Existing spec.html content (for re-entry); caller reads it. */
  existingSpec?: string;
  /**
   * Split-mode (spec 029-value-ranked-slicer, FR-001): instead of authoring, run
   * the value-ranked slicer on `existingSpec` and append a `<spec-split>` proposal.
   * Requires `existingSpec` (the over-budget parent). Mints nothing.
   */
  split?: boolean;
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
  /**
   * Discoverability hint (054-corpus-in-prompt, FR-003 / D-004). Set only when
   * no `knowledge/` corpus was found for this run; the CLI shows it at most
   * once, guarded by a `.spectastic/` marker. Never set when a corpus exists.
   */
  corpusHint?: string;
}

export interface DesignInput {
  /** Spec ID to plan against. */
  specId: string;
  /** Existing spec.html content (kernel reads). */
  specHtml: string;
  /** Existing design.html content (for re-entry; undefined = fresh). */
  existingDesign?: string;
  /** Existing principles.html content (for the principles check). */
  principlesHtml?: string;
  /**
   * Bounded decisions already answered for this verb (spec 037 FR-005 / 039).
   * Folded into the generation prompt so an unattended run's decisions shape the
   * plan. Absent ⇒ today's behaviour, byte-for-byte.
   */
  decisions?: Record<string, string>;
}

export interface DesignResult {
  html: string;
  decisionsCount: number;
  estimabilityBlockers: string[];
  principlesCheck: {
    ok: number;
    exceptions: number;
    violations: number;
  };
  /**
   * Discoverability hint (054-corpus-in-prompt, FR-003 / D-004). Set only when
   * no `knowledge/` corpus was found for this run; the CLI shows it at most
   * once, guarded by a `.spectastic/` marker. Never set when a corpus exists.
   */
  corpusHint?: string;
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
  /** Decider role for the adversarial checkpoint (spec 033 FR-001). Absent → checkpoint-default 'agent'. */
  decider?: 'human' | 'agent' | 'panel';
  /** Effort sizing a panel decider (spec 033 FR-004; 034 adds 'auto', the default). */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'auto';
  /** Auto-effort floor (spec 034 FR-003). Absent → 'low'. */
  floor?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

export interface ProposeResult {
  html: string;
  deltasCount: number;
  risks: RiskFinding[];
  /**
   * Discoverability hint (054-corpus-in-prompt, FR-003 / D-004). Set only when
   * no `knowledge/` corpus was found for this run; the CLI shows it at most
   * once, guarded by a `.spectastic/` marker. Never set when a corpus exists.
   */
  corpusHint?: string;
}

// --- course (verb explain --course, spec 019-explain-course) -----------

/** One multiple-choice quiz item generated from real source. */
export interface CourseQuizItem {
  /** The question text. */
  question: string;
  /** 2+ answer options. */
  options: string[];
  /** Index into options[] of the correct answer. */
  correctIndex: number;
  /** Optional per-option feedback (parallel to options[]). */
  feedback?: string[];
}

/**
 * A teaching-by-comparison move (060-course-teaching-payload FR-002): a
 * mapping from a familiar source concept to the target concept the
 * objective teaches. The one member with a *mapping* that can be wrong —
 * see `verifyAnalogyFit` — so it is the only member additionally posed to
 * the blind misleading-check (FR-005).
 */
export interface CourseAnalogy {
  /** The familiar concept the learner already understands. */
  source: string;
  /** The target concept being taught. */
  target: string;
  /** The mapping between them — what makes the analogy teach. */
  mapping: string;
  /** References this member's claims are grounded against. */
  refs: string[];
}

/**
 * Two aligned cases compared across named dimensions (060 FR-002) — the
 * highest-evidence teaching-by-comparison move (Gentner's analogical
 * encoding: comparing cases surfaces deep structure over surface
 * similarity).
 */
export interface CourseContrast {
  /** A short label for the first case. */
  caseA: string;
  /** A short label for the second case. */
  caseB: string;
  /** The dimensions compared, each contrasting caseA vs. caseB. */
  dimensions: { label: string; a: string; b: string }[];
  /** References this member's claims are grounded against. */
  refs: string[];
}

/** An ordered, fully-worked sequence of solved steps (060 FR-003, the
 * worked-example effect) — static; step-*fading* by proficiency band is
 * deferred to 019's band-personalization. */
export interface CourseWorkedExample {
  /** The steps, in order, each already solved (not left for the learner). */
  steps: string[];
  /** References this member's claims are grounded against. */
  refs: string[];
}

/** A self-contained inline illustration (060 FR-003, Mayer's multimedia
 * principle) — data, never script (P-11), mirroring `<spec-arch>`'s shape. */
export interface CourseIllustration {
  /** A self-contained inline `<svg>…</svg>` string. */
  svg: string;
  /** The caption explaining what the diagram shows. */
  caption: string;
  /** References this member's claims are grounded against. */
  refs: string[];
}

/**
 * The structured teaching payload (060-course-teaching-payload FR-001) —
 * reading prose plus zero or more optional teaching members. Supersedes a
 * flat string as a second valid shape for `CourseObjective.read`; a plain
 * string (the pre-060 form) remains valid and unchanged (FR-006).
 */
export interface StructuredRead {
  /** The grounded reading prose (same role as the flat string form). */
  prose: string;
  analogy?: CourseAnalogy;
  contrast?: CourseContrast;
  workedExample?: CourseWorkedExample;
  illustration?: CourseIllustration;
}

/** One learnable unit: a grounded read, a quiz, an ungraded teach-back. */
export interface CourseObjective {
  /** Short objective title (becomes the ledger row label). */
  title: string;
  /** Grounded Read explanation — a flat string (HTML-ish prose, the
   * pre-060 form) or a structured teaching payload (060 FR-001/FR-006). */
  read: string | StructuredRead;
  /** The objective's quiz item. */
  quiz: CourseQuizItem;
  /** Optional ungraded teach-back prompt (FR-007). */
  teachBack?: string;
  /** References the objective cites — spec IDs, element IDs, or paths (FR-003). */
  refs: string[];
}

/** The agent-drafted course, handed to the kernel on stdin (plan D-002). */
export interface CourseDraft {
  /** The repo-anchored target this course teaches. */
  target: string;
  /** Slug for the course directory; kernel derives one if absent. */
  slug?: string;
  /** Course title (defaults from target). */
  title?: string;
  /** "By the end you'll be able to…" one-liner. */
  outcome?: string;
  /** The objectives (≤7 per NFR-001). */
  objectives: CourseObjective[];
}

export interface CourseInput {
  /** The drafted course to verify + assemble. */
  draft: CourseDraft;
}

/** A per-item verification failure the agent must regenerate or drop (FR-004). */
export interface CourseItemFailure {
  /** Index into draft.objectives[]. */
  objectiveIndex: number;
  /** Why it failed. `'misleading-analogy'` is 060-course-teaching-payload's
   * addition (FR-005) — an analogy the blind check judged mis-mapped. */
  kind: 'missing-ref' | 'guessable' | 'misleading-analogy';
  /** Human-readable detail (the missing ref, the guessable question, or
   * the flagged analogy's mapping). */
  detail: string;
}

export interface CourseResult {
  /** Rendered course.html — present only when verification is clean. */
  html?: string;
  /** The course directory slug (<date>-<slug>). */
  slug: string;
  /** Per-item failures; empty ⇒ the draft passed and html is set. */
  failures: CourseItemFailure[];
  /** How many objectives were in the verified draft. */
  objectivesCount: number;
}

// --- implement (verb 014, single-task mode) ----------------------------

export interface ImplementInput {
  /** T-NNN, I-NNN, or spec-id. */
  target: string;
  /** Source spec.html content (for estimability gate). */
  specHtml?: string;
  /** Source design.html content. */
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

// --- verify (verb 021, derived per-spec verify.html view) --------------

/**
 * The real-run commands /implement captured in its Verify step (D-005),
 * written verbatim into the typed Run/Demo block. Absent on a links-only
 * standalone regeneration, where the engine preserves the prior block
 * (FR-006). Every field is optional: a docs-only task may have run nothing,
 * which renders as a loud gap rather than a silent blank (FR-009).
 */
export interface CapturedRun {
  /** Build/start command(s) — the `<spec-run>` content. */
  run?: string;
  /** Feature flag / env var / setting that must be on, or "none" — `<spec-toggle>`. */
  toggle?: string;
  /**
   * The entry point that exercises this feature — `<spec-exercise>` (spec 083,
   * FR-001/FR-002).
   *
   * Deliberately "entry point" and not "command". For a library or a CLI it is
   * the invocation (`spectastic owner "…"`); for something the `run` field
   * already serves, it is the address that reaches the feature
   * (`open http://localhost:3000/settings`) rather than a duplicate of the
   * server command.
   *
   * Distinct from `run`, which across the estate holds a *build* in 53 of 58
   * populated cases — because for a library, building is what running means.
   * That left the command a reader actually wants with nowhere to go but
   * `demo`, which is specified to be prose.
   *
   * Optional: a schema rule, a CI workflow or a docs change has no entry point,
   * and an absent field renders as a loud gap rather than being invented.
   */
  exercise?: string;
  /** The exact command that exercises this feature's tests — `<spec-tests>`. */
  tests?: string;
  /** The test-task ids the test command runs — `<spec-tests cites="…">` (FR-004). */
  testsCite?: string[];
  /** The human demo path (click-path, import, or request) — `<spec-demo>`. */
  demo?: string;
  /** The SC ids the demo path satisfies — `<spec-demo cites="…">` (FR-004). */
  demoCite?: string[];
  /**
   * Whether these commands were actually run (spec 021 T-003). Default true
   * (a /implement capture ran them). Set explicitly `false` when the commands
   * are suggested-but-unexecuted — the Run/Demo block then renders as
   * "suggested — not yet run" rather than presenting them as verified (P-7).
   */
  verified?: boolean;
  /**
   * The instrumentation evidence for the §Observables trace (spec
   * 048-verify-slo-trace, FR-002) — grounds the NFR -> SLO -> SLI ->
   * instrumentation chain in a real check, the same way `tests`/`demo`
   * ground the SC trace. One per-project capture (plan D-002's granularity
   * call): a single `/metrics`-class endpoint + the golden signals actually
   * observed there, covering every `<spec-slo>` the run checked.
   */
  observables?: {
    /** The metrics endpoint that was checked, e.g. "GET /metrics". */
    endpoint?: string;
    /** The golden-signal ids actually observed (a subset of the Four Golden Signals). */
    signals?: string[];
    /** The SLO/NFR ids this capture speaks to. */
    slosCite?: string[];
    /**
     * Whether the endpoint was actually queried (independent of the
     * top-level `verified` — Run/Demo and the observability check are
     * separate real-world actions). Default true; `false` marks this
     * capture "suggested — not yet run" and, per D-003, suppresses the
     * declared-vs-observed signal cross-check (FR-003) — a check that
     * wasn't run can't honestly flag a signal as "not observed".
     */
    verified?: boolean;
  };
}

export interface VerifyInput {
  /** The spec whose verify.html is generated (e.g. "021-verify-view"). */
  specId: string;
  /**
   * Real-run commands captured by /implement (D-005). Omitted on a
   * links-only regeneration, where the engine preserves the existing
   * Run/Demo block (FR-006).
   */
  capturedRun?: CapturedRun;
}

export interface VerifyResult {
  /** The spec this view belongs to. */
  specId: string;
  /** The generated, self-contained verify.html (FR-001). */
  html: string;
}

// --- explore (verb 022, the discovery scaffolder — front half) ---------

/**
 * The tracked, machine-readable quarantine marker (spec 022-explore, D-002 /
 * FR-004). Sits beside the git-ignored `explore.html` ledger as
 * `explorations/<id>/quarantine.json`; it is what `spectastic validate` and the
 * verb state-gate read, so the anti-ship guard stays visible to CI even though
 * the rich ledger is local-only. JSON, not HTML, by deliberate choice (plan §9)
 * — the cheapest machine read, precedented by the root `commands.json`.
 */
export interface QuarantineMarker {
  /** Exploration id (NNN-kebab) — shares the scheme with specs; graduation reuses it. */
  id: string;
  /** The one-line intent this build is trying to answer. */
  intent: string;
  /**
   * `"quarantined"` while live; flipped to `"graduated"` by the graduation
   * transaction (spec 023, FR-007). There is no "abandoned" terminal state
   * (022 FR-009). The verb gate + validate leg both pass on any non-quarantined
   * status, so the flip alone lifts the guard.
   */
  status: 'quarantined' | 'graduated';
  /** ISO date (YYYY-MM-DD) the exploration was scaffolded. */
  created: string;
  /** Set by graduation (spec 023, FR-002/FR-008): how the build was classified. Frozen in the archive. */
  classify?: GraduationClass;
  /** ISO date (YYYY-MM-DD) the exploration graduated; set with `status: "graduated"`. */
  graduated?: string;
}

/**
 * Input to the deterministic `exploreScaffold` kernel (D-001). The CLI resolves
 * the id, supplies today's date (keeping the kernel pure/deterministic given its
 * input — the verify pattern), and passes the thin-floor ledger template it read
 * from `templates/explore.html`.
 */
export interface ExploreInput {
  /** The resolved exploration id (NNN-kebab). */
  id: string;
  /** The one-line intent. */
  intent: string;
  /** ISO date (YYYY-MM-DD); supplied by the caller so the kernel stays deterministic. */
  created: string;
  /** The `templates/explore.html` contents the ledger is rendered from. */
  template: string;
  /**
   * Optional captured run, rendered into the ledger's Run/Demo block in the
   * shared verify shape (FR-008 / D-004). Absent at scaffold time — the block
   * renders loudly as "not recorded" until a run is captured.
   */
  capturedRun?: CapturedRun;
}

export interface ExploreResult {
  /** The resolved exploration id. */
  id: string;
  /** The rendered, git-ignored `explore.html` ledger. */
  ledgerHtml: string;
  /** The tracked quarantine marker, serialized by the CLI to `quarantine.json`. */
  marker: QuarantineMarker;
}

// --- graduate (verb 023, the discovery graduation — back half) ---------

/**
 * How a graduated exploration was classified (spec 023, FR-002 / D-2). A
 * `spike` keeps only the learning (clean rebuild); a `tracer-bullet` keeps the
 * code (refactor-to-comply). Decides the restore-task path; frozen in the
 * archived marker so it cannot be quietly reversed.
 */
export type GraduationClass = 'spike' | 'tracer-bullet';

/**
 * What the AI-coupled extract leg produces (spec 023, FR-003 / D-002): a Draft
 * spec + plan. The run record's proven facts are seeded as `verified` rows in the
 * plan's §3 evidence ledger (FR-004 / REQ-LIFECYCLE-006 — grounding is a plan
 * artifact). The restore-task generation split to 024-explore-restore, so no
 * `tasks.html` here.
 */
export interface GraduateExtract {
  /** The extracted Draft `spec.html`. */
  specHtml: string;
  /** The extracted Draft `design.html`, carrying the verified evidence ledger. */
  planHtml: string;
  /**
   * Discoverability hint (054-corpus-in-prompt, FR-003 / D-004). Set only when
   * no `knowledge/` corpus was found for this run; the CLI shows it at most
   * once, guarded by a `.spectastic/` marker. Never set when a corpus exists.
   */
  corpusHint?: string;
}

/**
 * Input to the pure graduation transaction kernel (spec 023, D-002). The extract
 * leg has already produced the bundle; this kernel performs the deterministic,
 * atomic mutations. The CLI supplies the date so the kernel stays pure.
 */
export interface GraduateTransactionInput {
  /** The quarantined exploration id, reused verbatim for `specs/<id>/`. */
  specId: string;
  /** spike (clean rebuild) | tracer-bullet (refactor-to-comply). */
  classification: GraduationClass;
  /** The extracted Draft `spec.html` + `design.html` (from the extract leg). */
  extract: GraduateExtract;
  /** ISO date (YYYY-MM-DD); caller-supplied to keep the kernel deterministic. */
  date: string;
}

export interface GraduateTransactionResult {
  /** The graduated id. */
  specId: string;
  /** Path of the written live spec (`specs/<id>/spec.html`). */
  specPath: string;
  /** Path of the archived, frozen exploration (`explorations/archive/<id>/`). */
  archivedPath: string;
  /** The recorded classification. */
  classification: GraduationClass;
}
