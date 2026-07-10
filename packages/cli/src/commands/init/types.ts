/**
 * Types for the init subcommand. The FileWriteDecision is the wire format
 * between the planner, prompt loop, and writer (D-005 of the plan).
 *
 * A plan is built once with every entry marked "write"; the prompt loop
 * mutates entries to "overwrite" or "skip" based on user choices or
 * --force; the writer only fires after the loop returns cleanly. Ctrl-C
 * during the loop exits before any writeFile call.
 */

export type FileAction = 'write' | 'overwrite' | 'skip';

export interface FileWriteDecision {
  /**
   * Absolute path inside the bundle (the source content). Present for
   * copy-based writes (assets, templates, commands). Omitted when the
   * decision carries `content` instead (composed profile artifacts, spec 041).
   */
  source?: string;
  /**
   * Literal file content to write, for composed artifacts that have no
   * on-disk source (init --profile: principles.html/AGENTS.md/CLAUDE.md).
   * The writer prefers this over `source` when present (D-002 of 041).
   */
  content?: string;
  /** CWD-relative path where the file will be written. */
  destination: string;
  /** Whether this destination existed before init started. */
  preExisting: boolean;
  /** Mutates from "write" to "overwrite"/"skip" via the prompt loop. */
  action: FileAction;
}

export interface BundleInventory {
  /** Absolute path to the bundle root (either _bundled/ or the dev fallback). */
  root: string;
  /** Source file paths inside the bundle, with their bundle-relative
   *  destination (matches the layout init writes to cwd). */
  files: ReadonlyArray<{ source: string; relativeDestination: string }>;
  /** Whether the bundle came from production (_bundled/) or the dev fallback. */
  origin: 'production' | 'dev-fallback';
}

export interface InitSummary {
  wrote: number;
  overwrote: number;
  skipped: number;
}
