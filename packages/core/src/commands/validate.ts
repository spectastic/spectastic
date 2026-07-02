import { validateMany } from '@spectastic/schema';
import type { Finding } from '@spectastic/schema';
import type {
  KernelContext,
  ValidateInput,
  ValidateResult,
} from '../types.js';

/**
 * The three structured invocation-metadata keys REQ-TOOL-004 (spec
 * 000-spectastic) requires in the source frontmatter of every command
 * spectastic surfaces as a skill. They are the machine-checkable contract
 * and skill-creator's inputs; the tuned `description` is the router surface.
 */
export const REQUIRED_SKILL_KEYS = ['triggers', 'use-when', 'sibling-boundary'] as const;

/**
 * `skill-metadata-shape` (REQ-TOOL-004). A command surfaced as a skill MUST
 * declare structured invocation metadata (`triggers`, `use-when`,
 * `sibling-boundary`) in its source frontmatter. This is a markdown/YAML
 * check — like the explore quarantine scan, it can't live in the HTML-bound
 * schema rule registry, so the finding is built here and the CLI globs the
 * command files and folds the results in.
 *
 * Returns a `warning`-severity finding when the frontmatter is absent or
 * missing any of the three keys; `null` when the shape is complete. Warning,
 * not error, so the ten existing commands can be brought up to the bar
 * without a red build (the eval floor and a future hard gate escalate it).
 *
 * Key presence is checked with a line-anchored regex rather than a YAML
 * parse: the keys are top-level, so `^<key>:` is sufficient and keeps the
 * kernel dependency-free.
 */
export function skillMetadataFinding(content: string, file: string): Finding | null {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  const frontmatter = match?.[1];
  const missing =
    frontmatter === undefined
      ? [...REQUIRED_SKILL_KEYS]
      : REQUIRED_SKILL_KEYS.filter((key) => !new RegExp(`^${key}:`, 'm').test(frontmatter));
  if (missing.length === 0) return null;
  const detail =
    frontmatter === undefined ? 'has no YAML frontmatter' : `is missing key(s): ${missing.join(', ')}`;
  return {
    file,
    line: 1,
    column: 1,
    rule: 'skill-metadata-shape',
    severity: 'warning',
    message: `Command ${file} ${detail} — skill-invocation metadata (${REQUIRED_SKILL_KEYS.join(', ')}) is required (REQ-TOOL-004).`,
    fixHint: `Add ${missing.join(', ')} to the frontmatter so the skill router and validate can find it.`,
  };
}

/**
 * Validate spec-html artifacts against the schema rules.
 *
 * Implements FR-004 of specs/006-kernel-extraction/spec.html. Per
 * D-006 of the plan: wraps `@spectastic/schema`'s validateMany; owns
 * no glob expansion (the CLI subcommand resolves patterns to paths
 * before calling); reads each file via ctx.fs (defaults to nodeFs
 * when ctx.fs is undefined, lazy-loaded only then).
 *
 * `validate` has no slash-command counterpart in commands/ — the CLI
 * subcommand is the primary surface today. Future MCP / VS Code
 * surfaces call this function directly to skip the process boundary.
 *
 * Exit code contract (FR-006):
 *   0 — clean (zero error-severity findings)
 *   1 — at least one error finding
 *   2 — usage / read error (file unreadable, etc.)
 */
export async function validateCommand(
  input: ValidateInput,
  ctx: KernelContext,
): Promise<ValidateResult> {
  const fs = ctx.fs ?? (await import('../providers/node-fs.js')).nodeFs;

  const inputs: Array<{ html: string; file: string }> = [];
  const filesValidated: string[] = [];

  for (const file of input.files) {
    try {
      const html = await fs.readFile(file, 'utf8');
      inputs.push({ html, file });
      filesValidated.push(file);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        findings: [],
        exitCode: 2,
        filesValidated,
        errorMessage: `Failed to read ${file}: ${message}`,
      };
    }
  }

  const findings = validateMany(inputs);
  const hasError = findings.some((f) => f.severity === 'error');

  return {
    findings,
    exitCode: hasError ? 1 : 0,
    filesValidated,
  };
}
