import { validateMany } from '@spectastic/schema';
import type {
  KernelContext,
  ValidateInput,
  ValidateResult,
} from '../types.js';

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
