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
    message: `Managed command adapter ${file} ${detail} — regenerate it.`,
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
    message: `Command ${file} ${detail} — skill-invocation metadata (${REQUIRED_SKILL_KEYS.join(', ')}) is required.`,
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
      message: `Command ${file} declares model: ${declared} — not a legal tier alias (${MODEL_TIER_ALIASES.join(' | ')}).`,
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
      message: `Command ${file} declares model: ${declared} but the policy assigns ${verb} → ${expected} — a policy drift.`,
      fixHint: `Set model: ${expected} to match the core policy map, or update VERB_MODEL_POLICY if the tier is meant to change.`,
    };
  }
  return null;
}

/**
 * `no-internal-id-in-copy` (P-10, REQ-FORMAT-006). User-facing tool copy MUST NOT
 * surface spectastic's own internal artifact ids — spec numbers/slugs, `REQ-*`,
 * `FR-*`, `T-*`, `P-*`, `D-*`. The line the invariant draws: is this a spec/plan
 * *artifact* citing its own governing ids as anchors (legitimate provenance per P-3
 * — e.g. a generated changelog line), or is it the *tool talking* (help text, error
 * messages, tool-managed markers)? The rule enforces the tool-talking half spectastic
 * can mechanically see and judge without ambiguity: the string arguments of its own
 * CLI `.description(...)` / `.option(...)` / `.argument(...)` help calls. The CLI globs
 * its command sources and folds these findings in; in a consumer project (no
 * `packages/cli` source) the glob matches nothing, so it's a no-op there.
 *
 * Reach is bounded *by design*, and permanently (P-8 honesty, recorded not hidden):
 * runtime finding messages and generated-artifact prose are review-caught, never linted
 * — a scan there would false-positive on a rule legitimately citing the requirement it
 * enforces. There is no plan to lift that ceiling (defer-to=never); it is the current
 * state made permanent, not a not-yet-built check.
 *
 * The scan is comment- and string-aware (not a blind regex): comments are masked first —
 * so a `// … (spec 026)` provenance note is never flagged — then only `.description` /
 * `.option` / `.argument` string args are checked. Legit help parens like `(default)`
 * carry no id and never match. `.argument` help is now in scope; its illustrative slug
 * uses the sanctioned neutral placeholder `001-auth-service` (allowlisted — indistinct
 * from a real slug by pattern), so a real slug like `021-verify-view` still trips the
 * rule while the placeholder passes. Kept dependency-free — no TS parser — to keep the
 * kernel light.
 */
/** Internal-id shapes that must never appear in user-facing CLI copy. Split into a small
 *  array rather than one mega-alternation so each shape stays legible (and under the
 *  regex-complexity budget). All matched case-insensitively. */
const INTERNAL_ID_PATTERNS: readonly RegExp[] = [
  /\bspec\s+\d{3}\b/i, //          "spec 042", "Spec 043"
  /\(\d{3}\)/, //                  bare "(037)"
  /\bREQ-[A-Z]+-\d+\b/i, //        "REQ-TOOL-004"
  /\b(?:FR|NFR|SC|D|T|I|P)-\d+\b/i, // "FR-006", "T-017", "P-10"
  /\b\d{3}-[a-z][a-z0-9-]*\b/i, //  slug "021-verify-view"
];

/** Illustrative example slugs sanctioned for argument/help text — not leaks. The neutral
 *  placeholder is indistinguishable from a real slug by pattern, so it is allowlisted rather
 *  than matched-around; a real slug (e.g. `021-verify-view`) still trips the rule. */
const SANCTIONED_EXAMPLE_SLUGS = new Set(['001-auth-service']);

/** The first internal id in `text` that isn't a sanctioned example slug, or null. */
function firstLeak(text: string): string | null {
  for (const re of INTERNAL_ID_PATTERNS) {
    const m = re.exec(text);
    if (m !== null && !SANCTIONED_EXAMPLE_SLUGS.has(m[0].toLowerCase())) return m[0];
  }
  return null;
}

/** Replace `//` and block comments with spaces (newlines/length preserved), string-aware. */
function maskComments(src: string): string {
  const out = src.split('');
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      i++;
      while (i < n) {
        if (src[i] === '\\') {
          i += 2;
          continue;
        }
        if (src[i] === q) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') {
        out[i] = ' ';
        i++;
      }
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] !== '\n') out[i] = ' ';
        i++;
      }
      if (i < n) {
        out[i] = ' ';
        out[i + 1] = ' ';
        i += 2;
      }
      continue;
    }
    i++;
  }
  return out.join('');
}

/** String-literal arguments (with 1-based start line) of every `.description(…)`/`.option(…)`/`.argument(…)`
 *  call in a comment-masked source. Paren depth is tracked outside strings, so `(default)`
 *  inside a help string never closes the call early. */
function helpStringArgs(masked: string): { text: string; line: number }[] {
  const results: { text: string; line: number }[] = [];
  const call = /\.(?:description|option|argument)\s*\(/g;
  const n = masked.length;
  let m: RegExpExecArray | null;
  while ((m = call.exec(masked)) !== null) {
    let i = m.index + m[0].length;
    let depth = 1;
    while (i < n && depth > 0) {
      const c = masked[i];
      if (c === '"' || c === "'" || c === '`') {
        const q = c;
        const startLine = masked.slice(0, i).split('\n').length;
        i++;
        let buf = '';
        while (i < n) {
          if (masked[i] === '\\') {
            buf += masked[i + 1] ?? '';
            i += 2;
            continue;
          }
          if (masked[i] === q) {
            i++;
            break;
          }
          buf += masked[i];
          i++;
        }
        results.push({ text: buf, line: startLine });
        continue;
      }
      if (c === '(') depth++;
      else if (c === ')') depth--;
      i++;
    }
  }
  return results;
}

/**
 * Build a `no-internal-id-in-copy` finding for every CLI help string in `content`
 * (a `.ts` source) that leaks an internal artifact id. Error severity — a leaked id
 * on a user surface is a defect, and the pre-commit gate blocks it. Returns an empty
 * array for a clean file. See the block comment above for scope and the P-8 ceiling.
 */
export function copyLeakFindings(content: string, file: string): Finding[] {
  const masked = maskComments(content);
  const findings: Finding[] = [];
  for (const { text, line } of helpStringArgs(masked)) {
    const leak = firstLeak(text);
    if (leak === null) continue;
    findings.push({
      file,
      line,
      column: 1,
      rule: 'no-internal-id-in-copy',
      severity: 'error',
      message: `User-facing help text leaks an internal artifact id "${leak}" — describe the behaviour, not its spec provenance.`,
      fixHint: 'Remove the spec/requirement id (e.g. "(spec 042)", "(037)", "REQ-…") from the help string; keep provenance in comments and the artifact trail. An illustrative slug in argument help must use the neutral placeholder 001-auth-service.',
    });
  }
  return findings;
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
