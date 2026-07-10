/**
 * The coding-agent runtime seam (spec 038-coding-agent-runtime).
 *
 * The `implement` kernel (014) only ticks a checkbox; the actual coding lives
 * outside the kernel. This module adds an injectable `CodingAgent` the runtime
 * hands one task at a time — performing the work inside an isolated `Sandbox`,
 * gating the tick on a `VerifyRunner` pass (P-7, FR-002/NFR-002). All three are
 * injected so CI runs deterministic fakes (the AI-in-CI discipline) and the real
 * tool-using adapter is one swappable boundary.
 */

/** The one task handed to a CodingAgent, with the context it needs to do the work. */
export interface TaskWork {
  /** The `T-NNN` id of the task. */
  taskId: string;
  /** The task's short title (the `<strong>` text). */
  title: string;
  /** The task's declared path (a `<span class="path">` — often the test file). */
  path: string;
  /** The working directory the agent must edit within (a sandbox dir). */
  cwd: string;
  /** Bundle context — the spec/plan/tasks the agent may read. */
  specHtml?: string;
  planHtml?: string;
  tasksHtml?: string;
}

/** What the agent reports back — its own account, NOT trusted for the tick (NFR-002). */
export interface AgentReport {
  /** `done` = the agent believes the task complete; `blocked` = it could not proceed. */
  status: 'done' | 'blocked';
  /** Paths the agent changed (relative to `cwd`). Empty ⇒ treated as blocked. */
  filesChanged: string[];
  /** One-line human summary of what it did. */
  summary: string;
}

/** The injectable coding agent. Stub (CI) replays a script; real adapter does tool-using work. */
export interface CodingAgent {
  perform(work: TaskWork): Promise<AgentReport>;
}

/** The result of running a task's verify command. */
export interface VerifyResult {
  passed: boolean;
  output: string;
}

/** Runs a task's verify command in a given directory. Injected so the drain logic is testable. */
export interface VerifyRunner {
  run(command: string, cwd: string): Promise<VerifyResult>;
}

/** An isolated workspace: the agent + verify run in `dir`; changes land only on `accept()`. */
export interface SandboxHandle {
  /** The isolated working directory to hand the agent. */
  dir: string;
  /** Bring the sandbox's changes into the primary tree (called only after verify passes). */
  accept(): Promise<void>;
  /** Throw the sandbox away, leaving the primary tree untouched. */
  discard(): Promise<void>;
}

/** Creates isolated sandboxes. Real impl = a git worktree; test impl = a temp dir. */
export interface Sandbox {
  create(baseCwd: string): Promise<SandboxHandle>;
}

/** The per-task verdict the runtime records (the tick is gated on `verifyPassed`). */
export interface TaskOutcome {
  taskId: string;
  status: 'done' | 'failed' | 'blocked';
  /** Whether the runtime's own verify passed — the ONLY gate for the tick (NFR-002). */
  verifyPassed: boolean;
  /** The verify command the runtime ran, if it reached that stage. */
  verifyCommand?: string;
  filesChanged: string[];
  summary: string;
}

/** Input to `drainTasks` — the bundle to drive. */
export interface DrainInput {
  tasksHtml: string;
  specHtml?: string;
  planHtml?: string;
}

/** Everything `drainTasks` needs, with the three seams injected. */
export interface DrainContext {
  cwd: string;
  coding: CodingAgent;
  sandbox: Sandbox;
  verify: VerifyRunner;
}

/** The result of a drain: what ticked, and where (if) it halted. */
export interface DrainResult {
  /** The `T-NNN`s ticked, in order. */
  ticked: string[];
  /** The updated tasks.html with the ticks applied (the caller persists it). */
  tasksHtml: string;
  /** Set when the drain halted on a task that did not verify — the escalation payload. */
  halted?: { taskId: string; reason: string; outcome: TaskOutcome };
  /** Unchecked `<input>` count remaining after the drain. */
  remainingUnchecked: number;
}
