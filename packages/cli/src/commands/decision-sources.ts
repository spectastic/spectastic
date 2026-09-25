import { readConfigFile } from '@spectastic/schema/config';

/**
 * Resolve `decisions.sources[]` from `spectastic.json` at the CLI edge (spec
 * 122-decision-index-federation, D-004/FR-003) — shared by `verdict` (reads
 * each source's vendored copy) and `decisions sync` (fetches it). The
 * kernel reads no config either way; this is what turns config text into
 * the data both commands pass in.
 *
 * Fail-safe like `loadWaivers`: a structurally incomplete entry (missing
 * `project`/`from`, or a non-string `pin`) is dropped silently rather than
 * crash the caller — the loud validation is `validate`'s job. A source
 * naming this project itself is refused outright (FR-003): a project cannot
 * federate with itself, and letting it through would feed a caller a
 * decision this project could never legitimately be a non-owner of.
 */

export interface DeclaredSource {
  project: string;
  from: string;
  pin?: string;
}

interface RawSource {
  project?: unknown;
  from?: unknown;
  pin?: unknown;
}

/** `verb` names the caller in the self-reference refusal message
 *  (`"verdict"`, `"decisions sync"`), so the exit is legible either way. */
export function resolveDecisionSources(cwd: string, currentProject: string, verb: string): DeclaredSource[] {
  const parsed = readConfigFile(cwd);
  const decisionsSection = (parsed as Record<string, unknown>).decisions;
  if (decisionsSection === null || typeof decisionsSection !== 'object' || Array.isArray(decisionsSection)) return [];
  const raw = (decisionsSection as Record<string, unknown>).sources;
  if (!Array.isArray(raw)) return [];

  const out: DeclaredSource[] = [];
  for (const entry of raw as RawSource[]) {
    if (entry === null || typeof entry !== 'object') continue;
    const { project, from, pin } = entry;
    if (typeof project !== 'string' || project === '' || typeof from !== 'string' || from === '') continue;
    if (pin !== undefined && typeof pin !== 'string') continue;
    if (project === currentProject) {
      process.stderr.write(`${verb}: a declared source names this project ("${project}") — a project cannot federate with itself.\n`);
      process.exit(2);
    }
    out.push(pin !== undefined ? { project, from, pin } : { project, from });
  }
  return out;
}
