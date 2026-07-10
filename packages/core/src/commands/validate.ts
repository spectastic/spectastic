import { validateMany } from '@spectastic/schema';
import type { Finding } from '@spectastic/schema';
import type {
  KernelContext,
  ValidateInput,
  ValidateResult,
} from '../types.js';
import { MODEL_TIER_ALIASES, VERB_MODEL_POLICY, isModelTier } from '../model-policy/index.js';

/**
 * The three structured invocation-metadata keys REQ-TOOL-004 (spec
 * 000-spectastic) requires in the source frontmatter of every command
 * spectastic surfaces as a skill. They are the machine-checkable contract
 * and skill-creator's inputs; the tuned `description` is the router surface.
 */
export const REQUIRED_SKILL_KEYS = ['triggers', 'use-when', 'sibling-boundary'] as const;

/**
 * `commands-drift` (spec 031-init-tools, FR-007 / plan D-001). An init-tools
 * managed command adapter (`.claude/commands/spectastic.*.md`) MUST match its
 * `commands/*.md` source byte-for-byte — generate-on-demand means "can't ship
 * stale", enforced by the pre-commit gate. Returns an `error` finding when the
 * adapter is missing or diverges; `null` when it matches. Like the skill and
 * quarantine scans, this compares gitignored markdown, so it lives here rather
 * than the HTML-bound schema rule registry, and the CLI folds it in.
 */
export function commandsDriftFinding(
  source: string,
  adapter: string | null,
  file: string,
): Finding | null {
  if (adapter === source) return null;
  const detail = adapter === null ? 'is missing' : 'has drifted from its source';
  return {
    file,
    line: 1,
    column: 1,
    rule: 'commands-drift',
    severity: 'error',
    message: `Managed command adapter ${file} ${detail} — regenerate it (spec 031 FR-007).`,
    fixHint: 'Run `spectastic init --tools --commands-only` to regenerate the adapters from source.',
  };
}

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
 * `verb-model-policy` — the drift-guard for the optional `model:` frontmatter key
 * (spec 044-verb-model-policy, FR-009; the enforcement half of REQ-TOOL-004's
 * permission). REQ-TOOL-004 permits the key and `skill-metadata-shape` deliberately
 * ignores it (checks only the three required keys), so this rule is what gives the
 * permitted key machine coverage — closing the P-8 "permission without enforcement"
 * gap the 000 adversarial pass flagged. A present `model:` value that is (a) not a
 * legal alias or (b) disagrees with the core `VERB_MODEL_POLICY` map is an error;
 * an absent key is clean (the key is optional). Reads the one source of truth, so
 * it can never disagree with the map. Like the skill and quarantine scans, it
 * inspects gitignored markdown and folds into every validate run (P-9).
 */
export function verbModelPolicyFinding(content: string, file: string): Finding | null {
  const fm = /^---\n([\s\S]*?)\n---/.exec(content)?.[1];
  if (fm === undefined) return null; // no frontmatter → skill-metadata-shape owns that
  const declared = /^model:[ \t]*(\S+)/m.exec(fm)?.[1];
  if (declared === undefined) return null; // optional key absent → clean

  const verb = /spectastic\.([a-z-]+)\.md$/.exec(file)?.[1] ?? '';
  const expected = VERB_MODEL_POLICY[verb];

  if (!isModelTier(declared)) {
    return {
      file,
      line: 1,
      column: 1,
      rule: 'verb-model-policy',
      severity: 'error',
      message: `Command ${file} declares model: ${declared} — not a legal tier alias (${MODEL_TIER_ALIASES.join(' | ')}) (spec 044 FR-009).`,
      fixHint: `Set model: to one of ${MODEL_TIER_ALIASES.join(', ')} — aliases only, never a pinned model id.`,
    };
  }
  if (expected !== undefined && declared !== expected) {
    return {
      file,
      line: 1,
      column: 1,
      rule: 'verb-model-policy',
      severity: 'error',
      message: `Command ${file} declares model: ${declared} but the policy assigns ${verb} → ${expected} (spec 044 FR-009 · VERB_MODEL_POLICY drift).`,
      fixHint: `Set model: ${expected} to match the core policy map, or update VERB_MODEL_POLICY if the tier is meant to change.`,
    };
  }
  return null;
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
