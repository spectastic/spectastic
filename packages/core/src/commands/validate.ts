import { isAbsolute, relative, resolve as resolvePath } from 'node:path';
import type { Finding } from '@spectastic/schema';
import { validateMany } from '@spectastic/schema';
import type { ContractDeclaration } from '@spectastic/schema/contract';
import type { Element } from '@spectastic/schema/parser';
import { findAll, getAttr, getLocation, parse } from '@spectastic/schema/parser';
import { isQuantifiedTarget } from '@spectastic/schema/slo';
import type { VisualDeclaration } from '@spectastic/schema/visual';
import { conventionalVisualPrefix, isUnderPrefix, owningSpecId } from '../visual/location.js';
import type { VisualDeclarationState } from '../visual/read.js';
import { daysBetween, isBoilerplateReason, MAX_WAIVER_DAYS, parseIsoDate, type RawWaiver } from '../enforce/config.js';
import type { EnforcementCategory } from '../enforce/types.js';
import { isModelTier, MODEL_TIER_ALIASES, VERB_MODEL_POLICY } from '../model-policy/index.js';
import type { FileSystem, KernelContext, ValidateInput, ValidateResult } from '../types.js';

interface WaiverProblem {
  message: string;
  fixHint: string;
}
type WaiverCtx = {
  required: readonly EnforcementCategory[];
  unwaivable: readonly EnforcementCategory[];
  validCategories: readonly EnforcementCategory[];
  now: Date;
};

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
export function commandsDriftFinding(source: string, adapter: string | null, file: string): Finding | null {
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
  const detail = frontmatter === undefined ? 'has no YAML frontmatter' : `is missing key(s): ${missing.join(', ')}`;
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
  let m = call.exec(masked);
  while (m !== null) {
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
    m = call.exec(masked);
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
      fixHint:
        'Remove the spec/requirement id (e.g. "(spec 042)", "(037)", "REQ-…") from the help string; keep provenance in comments and the artifact trail. An illustrative slug in argument help must use the neutral placeholder 001-auth-service.',
    });
  }
  return findings;
}

/**
 * `enforce-waiver-well-formed` (spec 042, FR-013). A waiver is a gate-weakening
 * instrument, so its well-formedness is a P-8 kernel/CI invariant, not prose. This
 * is the loud half of the two-guard design: `enforce` fails closed at runtime
 * (ignoring a broken waiver so it can never disable a gate), while this scan gives
 * the author fast, specific feedback at the git/CI boundary. Error severity for
 * every problem: unknown / dead / un-relaxable category, empty or boilerplate
 * reason, missing owner, and a `until` that is missing, malformed, already past
 * (a silently-expired waiver), or more than 365 days out.
 *
 * Pure: the CLI reads `spectastic.json`'s raw `enforce.waivers[]` and the project's
 * profile floor, then calls this. A no-op (empty) when there are no waivers.
 */
function categoryProblem(w: RawWaiver, label: string, ctx: WaiverCtx): WaiverProblem | null {
  if (typeof w.category !== 'string') {
    return {
      message: `Waiver ${label} has no string "category".`,
      fixHint: 'Set category to one of the enforcement categories in your profile floor.',
    };
  }
  const cat = w.category as EnforcementCategory;
  if (!ctx.validCategories.includes(cat)) {
    return {
      message: `Waiver ${label} names an unknown enforcement category.`,
      fixHint: `Use a valid category: ${ctx.validCategories.join(', ')}.`,
    };
  }
  if (ctx.unwaivable.includes(cat)) {
    return {
      message: `Waiver ${label} names an un-relaxable category — it has no effect (the category keeps gating).`,
      fixHint:
        'Remove the waiver; this category cannot be relaxed on this profile. Cover it with a tool or choose a different profile.',
    };
  }
  if (!ctx.required.includes(cat)) {
    return {
      message: `Waiver ${label} names a category not in this profile's floor — a dead waiver.`,
      fixHint: 'Remove it; only a required category needs a waiver.',
    };
  }
  return null;
}

function untilProblem(w: RawWaiver, label: string, now: Date): WaiverProblem | null {
  if (typeof w.until !== 'string') {
    return {
      message: `Waiver ${label} has no "until" expiry.`,
      fixHint: 'Set until to an ISO YYYY-MM-DD date within 365 days.',
    };
  }
  const until = parseIsoDate(w.until);
  if (until === null) {
    return {
      message: `Waiver ${label} has an invalid "until" (${w.until}) — expected ISO YYYY-MM-DD.`,
      fixHint: 'Use an ISO YYYY-MM-DD date, e.g. 2026-10-01.',
    };
  }
  const days = daysBetween(now, until);
  if (days < 0) {
    return {
      message: `Waiver ${label} expired on ${w.until} — remove or renew it.`,
      fixHint: 'An expired waiver auto-blocks; delete it or set a fresh until within 365 days.',
    };
  }
  if (days > MAX_WAIVER_DAYS) {
    return {
      message: `Waiver ${label} expires ${w.until}, more than ${MAX_WAIVER_DAYS} days out.`,
      fixHint: `Set until within ${MAX_WAIVER_DAYS} days so the waiver can't be written to never expire.`,
    };
  }
  return null;
}

/** Every well-formedness problem with one raw waiver (empty when clean). */
function waiverProblems(w: RawWaiver, label: string, ctx: WaiverCtx): WaiverProblem[] {
  const problems: WaiverProblem[] = [];
  const category = categoryProblem(w, label, ctx);
  if (category) problems.push(category);
  if (typeof w.reason !== 'string' || isBoilerplateReason(w.reason)) {
    problems.push({
      message: `Waiver ${label} has an empty or boilerplate reason.`,
      fixHint:
        'Give a specific justification (what and why, ideally a ticket ref) — a placeholder like "n/a"/"todo" is rejected.',
    });
  }
  if (typeof w.owner !== 'string' || w.owner.trim().length === 0) {
    problems.push({
      message: `Waiver ${label} has no owner.`,
      fixHint: 'Set owner to whoever accepted the risk.',
    });
  }
  const until = untilProblem(w, label, ctx.now);
  if (until) problems.push(until);
  return problems;
}

export function enforceWaiverFindings(waivers: readonly RawWaiver[], ctx: WaiverCtx, file: string): Finding[] {
  const findings: Finding[] = [];
  waivers.forEach((w, i) => {
    const label = typeof w.category === 'string' ? `"${w.category}"` : `#${i + 1}`;
    for (const { message, fixHint } of waiverProblems(w, label, ctx)) {
      findings.push({
        file,
        line: 1,
        column: 1,
        rule: 'enforce-waiver-well-formed',
        severity: 'error',
        message,
        fixHint,
      });
    }
  });
  return findings;
}

/** The profile tiers at which a verified NFR must be quantified (FR-004). */
const QUANTIFIED_NFR_GATED_TIERS = new Set(['verified', 'enterprise']);

/**
 * Whether a resolved profile tier gates the quantified-NFR check. Exported so
 * the CLI scan can short-circuit *before* re-reading the validated files when
 * the gate can't fire (no marker, or a tier below verified) — a project with
 * no profile pays no extra I/O on validate (the perf floor the bench guards).
 */
export function isQuantifiedNfrGatedTier(tier: string | undefined): boolean {
  return tier !== undefined && QUANTIFIED_NFR_GATED_TIERS.has(tier);
}

/** Collect an element's visible text, collapsed (mirrors slo-well-formed's textOf). */
function textOf(el: Element): string {
  let out = '';
  const visit = (node: unknown): void => {
    const n = node as {
      tagName?: string;
      value?: string;
      childNodes?: unknown[];
    };
    if (n.tagName === undefined && typeof n.value === 'string') out += n.value;
    if (n.childNodes) for (const child of n.childNodes) visit(child);
  };
  visit(el);
  return out.replace(/\s+/g, ' ').trim();
}

/** Leading numeric spec id from a validated file path (e.g. "specs/032-x/spec.html" → 32);
 *  null when the path carries no parseable spec directory number. Mirrors
 *  `verify-view-missing.ts`'s own `specNum` helper — same convention-floor shape. */
function specNumFromFile(file: string): number | null {
  const m = /(?:^|\/)specs\/(\d+)[^/]*\/spec\.html$/.exec(file);
  return m?.[1] ? Number.parseInt(m[1], 10) : null;
}

/**
 * The "verified NFRs are quantified" check (spec 047-slo-nfr-artifact, FR-004,
 * US2). Given a set of already-read spec-html documents and the project's
 * resolved profile tier, flag every `NFR-*` requirement that is neither
 * inline-quantified in its own prose (T-010's heuristic — a measurable
 * number/percentile/threshold) nor refined by a linked `<spec-slo target>` —
 * but only at the `verified`/`enterprise` tiers. Below that, or with no
 * resolved tier (no profile marker), this is a no-op — fail-safe in the
 * advisory direction, mirroring `enforceWaiverFindings`.
 *
 * A non-empty `slo=` attribute (the light NFR annotation, FR-003) also
 * satisfies "inline-quantified" — same acceptance as prose carrying a
 * measurable target (T-310).
 *
 * `ctx.floor` (068-enterprise-enforce-floor FR-009, plan D-003) is an optional
 * config-declared convention floor: a spec whose leading directory number is
 * below it predates the quantified-NFR convention and is exempt, mirroring
 * `verify-view-missing`'s own precedent — except that rule *derives* its floor
 * from an artifact signal, while this one is config-declared (no clean
 * equivalent signal exists here). A file whose spec id can't be parsed is
 * never exempted (fails toward gating, not silence). No floor configured
 * (`undefined`) leaves today's behavior unchanged — every gated-tier spec
 * is checked.
 */
export function quantifiedNfrFindings(
  docs: readonly { html: string; file: string }[],
  ctx: { tier: string | undefined; floor?: number },
): Finding[] {
  if (!isQuantifiedNfrGatedTier(ctx.tier)) return [];

  const findings: Finding[] = [];
  for (const { html, file } of docs) {
    if (ctx.floor !== undefined) {
      const num = specNumFromFile(file);
      if (num !== null && num < ctx.floor) continue;
    }
    const doc = parse(html, file);
    const nfrs = findAll(doc.ast, 'spec-requirement').filter((el) => (getAttr(el, 'id') ?? '').startsWith('NFR-'));
    if (nfrs.length === 0) continue;

    const linkedTargets = new Set(
      findAll(doc.ast, 'spec-slo')
        .map((el) => getAttr(el, 'target'))
        .filter((t): t is string => typeof t === 'string'),
    );

    for (const nfr of nfrs) {
      const id = getAttr(nfr, 'id') ?? '';
      const sloAttr = getAttr(nfr, 'slo') ?? '';
      if (isQuantifiedTarget(textOf(nfr)) || isQuantifiedTarget(sloAttr) || linkedTargets.has(id)) continue;

      const loc = getLocation(nfr);
      findings.push({
        file,
        line: loc.line,
        column: loc.column,
        rule: 'quantified-nfr-required',
        severity: 'error',
        message: `NFR "${id}" is not quantified at the ${ctx.tier} profile — no measurable target in its prose and no linked <spec-slo>`,
        fixHint: `Add a measurable target to ${id}'s prose (e.g. "p95 < 200 ms"), or refine it with a <spec-slo target="${id}">.`,
      });
    }
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
export async function validateCommand(input: ValidateInput, ctx: KernelContext): Promise<ValidateResult> {
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

/**
 * The contract resolve check (spec 070-contract-sidecar-convention, FR-004/
 * FR-006, design D-002/D-003/D-004). Cannot be a schema rule — the rule
 * engine is pure-AST with zero filesystem imports (design's decisive
 * grounding fact) — so this is the folded-scan half `scanContractResolve`
 * calls, given the declarations 070's own reader already parsed out.
 *
 * For each declaration carrying a `path=`, in order:
 *  1. Containment (D-004) — an absolute path, a `..` segment, or a resolved
 *     path outside `cwd` is rejected as escaping, never stat-ed.
 *  2. specs/-exclusion (D-003) — a path resolving inside `<cwd>/specs/` is
 *     itself the error, even when the file exists and is byte-identical to
 *     a real proposed contract; this is what keeps a proposed contract from
 *     ever satisfying an effective declaration (FR-002/FR-003).
 *  3. Resolution — stat the path; classify absent vs. a directory vs. an
 *     unreadable file vs. a genuinely readable one (silent), per FR-006.
 *
 * A declaration with no `path=` (shape="none", or a still-malformed one the
 * shape rule will separately flag) is skipped — nothing to resolve.
 */
export async function contractResolveFindings(
  declarations: readonly ContractDeclaration[],
  file: string,
  fs: FileSystem,
  cwd: string,
): Promise<Finding[]> {
  const findings: Finding[] = [];

  for (const decl of declarations) {
    if (decl.path === undefined) continue;

    const flag = (message: string, fixHint: string): void => {
      findings.push({
        file,
        line: decl.line,
        column: decl.column,
        rule: 'contract-resolve',
        severity: 'error',
        message,
        fixHint,
      });
    };

    // 1. Containment (D-004) — checked on the declared string and the
    // resolved path both, so neither a leading `/` nor a `..` segment nor a
    // resolution that lands outside cwd is ever stat-ed.
    if (isAbsolute(decl.path)) {
      flag(
        `<spec-contract path="${decl.path}"> in ${file} is an absolute path, which escapes the project directory`,
        'Declare a project-relative path (spec.html FR-002) — an absolute path is rejected rather than followed.',
      );
      continue;
    }
    const resolved = resolvePath(cwd, decl.path);
    const rel = relative(cwd, resolved);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      flag(
        `<spec-contract path="${decl.path}"> in ${file} resolves outside the project directory`,
        'Remove the .. traversal — a declared path must stay inside the project (spec.html NFR-001).',
      );
      continue;
    }

    // 2. specs/-exclusion (D-003) — structural, by resolved-path prefix, never
    // by content comparison (a proposed and an effective contract can be
    // byte-identical). A resolved-prefix comparison, not a substring match —
    // `myspecs/api.yaml` must NOT match (T-201's regression case).
    if (rel === 'specs' || rel.startsWith('specs/')) {
      flag(
        `<spec-contract path="${decl.path}"> in ${file} resolves inside specs/, so it can never be an effective declaration`,
        'The effective contract MUST live outside specs/ (spec.html FR-002) — a path under specs/ is always a proposed contract, never effective, regardless of whether the file exists (FR-003).',
      );
      continue;
    }

    // 3. Resolution — absent vs. directory vs. unreadable vs. readable (silent).
    let stat: { isFile: boolean; isDirectory: boolean };
    try {
      stat = await fs.stat(resolved);
    } catch {
      flag(
        `<spec-contract path="${decl.path}"> in ${file} — no such file`,
        `Check for a typo, or that the contract was committed (spec.html FR-004).`,
      );
      continue;
    }
    if (stat.isDirectory) {
      flag(
        `<spec-contract path="${decl.path}"> in ${file} names a directory, not a readable file`,
        'Declare the path to the contract file itself, not its containing directory (spec.html FR-006).',
      );
      continue;
    }
    try {
      await fs.readFile(resolved, 'utf8');
    } catch {
      flag(
        `<spec-contract path="${decl.path}"> in ${file} exists but is not a readable file`,
        "Check the file's permissions, or that it is a regular file (spec.html FR-006).",
      );
    }
  }

  return findings;
}

/**
 * The visual resolve check (spec 093-design-visual-section, FR-010, design
 * D-005). Cannot be a schema rule for the same reason its contract sibling
 * cannot — the rule engine is pure-AST with zero filesystem imports — so this
 * is the folded-scan half `scanVisualResolve` calls.
 *
 * The containment sequence is cloned VERBATIM from `contractResolveFindings`:
 * an absolute path, a `..` segment, or a resolved path outside `cwd` is
 * rejected and never stat-ed. That is the security-relevant half and it stays
 * byte-identical to a reviewed implementation on purpose.
 *
 * Exactly one branch differs, and the difference is the point (D-005): a path
 * resolving to a DIRECTORY is an error for a contract, which is one file, and
 * SILENT here, because a token set split by mode is the normal case (FR-005).
 * Do not "simplify" these two functions back together.
 *
 * `source=` and `tokens-external=` are never resolved. The first is provenance
 * for a reader (FR-006) and the second names a package, not a path; reaching
 * for either at check time would make a spec only as valid as somebody's seat.
 */
export async function visualResolveFindings(
  declarations: readonly VisualDeclaration[],
  file: string,
  fs: FileSystem,
  cwd: string,
): Promise<Finding[]> {
  const findings: Finding[] = [];

  for (const decl of declarations) {
    const declaredPaths: { attr: 'tokens' | 'screens'; value: string }[] = [];
    if (decl.tokens !== undefined) declaredPaths.push({ attr: 'tokens', value: decl.tokens });
    if (decl.screens !== undefined) declaredPaths.push({ attr: 'screens', value: decl.screens });

    for (const { attr, value } of declaredPaths) {
      const flag = (message: string, fixHint: string): void => {
        findings.push({
          file,
          line: decl.line,
          column: decl.column,
          rule: 'visual-resolve',
          severity: 'error',
          message,
          fixHint,
        });
      };

      // 1. Containment — checked on the declared string and the resolved path
      // both, so neither a leading `/` nor a `..` segment nor a resolution
      // landing outside cwd is ever stat-ed.
      if (isAbsolute(value)) {
        flag(
          `<spec-visual ${attr}="${value}"> in ${file} is an absolute path, which escapes the project directory`,
          'Declare a project-relative path (spec.html FR-010) — an absolute path is rejected rather than followed.',
        );
        continue;
      }
      const resolved = resolvePath(cwd, value);
      const rel = relative(cwd, resolved);
      if (rel.startsWith('..') || isAbsolute(rel)) {
        flag(
          `<spec-visual ${attr}="${value}"> in ${file} resolves outside the project directory`,
          'Remove the .. traversal — a declared path must stay inside the project (spec.html FR-010).',
        );
        continue;
      }

      // 2. Resolution. A directory is legal here, unlike a contract path.
      try {
        await fs.stat(resolved);
      } catch {
        flag(
          `<spec-visual ${attr}="${value}"> in ${file} — no such file or directory`,
          'Check for a typo, or that the visual material was committed (spec.html FR-010). This is the likeliest way a declaration goes quietly wrong: the file moved and nothing said so.',
        );
      }
    }
  }

  return findings;
}

/**
 * The gating check (spec 093-design-visual-section, FR-002 / SC-002): absence,
 * not emptiness.
 *
 * A scan rather than a schema rule, and not by preference — the condition is
 * filesystem state (does this project have a user interface) and the rule
 * engine has no filesystem access. `verify-view-missing` is the precedent for
 * conditional presence, but only for its shape: it derives its condition from
 * the documents it is handed, which this cannot.
 *
 * The caller supplies the antecedent via `projectHasVisualSurface`, which keeps
 * this function pure and makes the interesting case testable without a
 * fixture project per assertion.
 *
 * What it catches is the scaffold nobody deleted. A design that genuinely
 * declares a surface is never flagged — FR-004's escape hatch for a hand-rolled
 * interface no signal can see — because that declaration is itself what makes
 * the antecedent true.
 */
export function visualSectionGatedFindings(html: string, file: string, projectHasSurface: boolean): Finding[] {
  if (projectHasSurface) return [];

  // A template is a scaffold, not an authored design. It carries the section
  // unconditionally BY DESIGN — `templates/` is copied verbatim and cannot vary
  // per project — so flagging it would contradict the very decision that put
  // the section there, and the fix it suggests (delete the section) would be
  // actively wrong. Caught while draining 094's first task, on this repository.
  if (/(?:^|\/)templates\//.test(file)) return [];

  const doc = parse(html, file);
  const section = findAll(doc.ast, 'section').find((el) => getAttr(el, 'id') === 'visual');
  const declaration = findAll(doc.ast, 'spec-visual')[0];
  const carrier = section ?? declaration;
  if (carrier === undefined) return [];

  const loc = getLocation(carrier);
  return [
    {
      file,
      line: loc.line,
      column: loc.column,
      rule: 'visual-section-gated',
      severity: 'error',
      message: `${file} carries a Visual surface section, but this project has no user interface — none detected and none declared`,
      fixHint:
        'Delete the section outright (spec.html FR-002). The template scaffolds it unconditionally because a static file cannot vary per project; an absent section is reported as nothing at all, an empty one is a question nobody can answer. If this project does have an interface the tool cannot see, declare it instead — a declaration outranks detection (FR-004).',
    },
  ];
}

/**
 * The conventional-location check (spec 094-visual-sidecar-convention,
 * FR-001/FR-002, design D-001).
 *
 * 093 checks that a declared path RESOLVES; a token set under `design/`
 * resolves perfectly well and is still in the wrong place. This is what turns
 * a named convention into one a second author cannot get wrong, which is what
 * SC-003 asks for.
 *
 * Pure — 0 filesystem calls. The resolve check already spends the one stat per
 * declared path that NFR-001 budgets, and this spends nothing on top, so a
 * second check over the same declarations moves no cost.
 */
export function visualLocationFindings(declarations: readonly VisualDeclaration[], file: string): Finding[] {
  const findings: Finding[] = [];
  const specId = owningSpecId(file);

  for (const decl of declarations) {
    const declared: { kind: 'tokens' | 'screens'; value: string }[] = [];
    if (decl.tokens !== undefined) declared.push({ kind: 'tokens', value: decl.tokens });
    if (decl.screens !== undefined) declared.push({ kind: 'screens', value: decl.screens });

    for (const { kind, value } of declared) {
      const prefix = conventionalVisualPrefix(kind, specId);
      // Only for screens, and only outside specs/: no owning spec means no
      // conventional location to compare against, so the check stands down
      // rather than guessing an id.
      if (prefix === null) continue;
      if (isUnderPrefix(value, prefix)) continue;

      const scope = kind === 'tokens' ? "the project's" : "this feature's";
      findings.push({
        file,
        line: decl.line,
        column: decl.column,
        rule: 'visual-location',
        severity: 'error',
        message: `<spec-visual ${kind}="${value}"> in ${file} is not under ${prefix}/, where ${scope} visual material lives`,
        fixHint: `Move it under ${prefix}/ and declare the new path (spec.html FR-00${kind === 'tokens' ? '1' : '2'}). The same directory name at two scopes is deliberate: the project's token set is at visual/, a feature's screens at specs/<spec-id>/visual/. Subdividing beneath either is fine.`,
      });
    }
  }

  return findings;
}

/**
 * One design system, one token set (spec 094-visual-sidecar-convention, FR-004,
 * design D-002).
 *
 * Two designs naming different token paths are two claims about one thing.
 * Reported rather than resolved: a union is the right answer for N contracts
 * and a meaningless one here, and precedence would silently pick a winner.
 *
 * Computed off the project pass `declaredVisualState` already made, so it adds
 * no filesystem access — which is what keeps NFR-001 true while adding a check
 * that is, by nature, about every design at once.
 */
export function visualDisagreementFindings(state: VisualDeclarationState | null, file: string): Finding[] {
  if (state === null) return [];

  // Provenance comes free because the state already carries it, and a reader
  // told only that paths disagree cannot act on it.
  const byPath = new Map<string, Set<string>>();
  for (const p of state.declaredPaths) {
    if (p.kind !== 'tokens') continue;
    const specs = byPath.get(p.path) ?? new Set<string>();
    specs.add(p.specId);
    byPath.set(p.path, specs);
  }
  if (byPath.size <= 1) return [];

  const claims = [...byPath.entries()]
    .map(([path, specs]) => `${path} (${[...specs].sort().join(', ')})`)
    .sort()
    .join(' vs ');

  return [
    {
      file,
      line: 1,
      column: 1,
      rule: 'visual-token-set-disagreement',
      severity: 'error',
      message: `${byPath.size} different project token-set paths are declared across this project's designs: ${claims}`,
      fixHint:
        'There is one design system, so two paths are two claims about one thing. Settle on a single token-set path and correct the designs that disagree (spec.html FR-004) — this is reported rather than resolved, because neither precedence nor a union would be right.',
    },
  ];
}

/**
 * Flag a materialised `<spec-contract-view>` (072-contract-embedded-view,
 * FR-004) that no longer matches the contract file it projects. Live
 * re-read and compare, no stored digest (design D-005) — matches
 * `verify-view-stale`'s precedent for the same shape of problem.
 *
 * Deliberately normalises line endings and trailing-newline count before
 * comparing (design §10) — unlike 071-contract-promotion's D-006, which
 * compares exact bytes. There, a difference means someone else changed the
 * destination and a false negative would clobber their work; here, a
 * difference means the *projection* is stale, and a checkout that merely
 * rewrote line endings has not made anything stale.
 *
 * A declaration with no view (FR-007/FR-008 — the common case) is skipped
 * entirely; there is nothing to have gone stale.
 */
export async function contractViewDriftFindings(
  declarations: readonly ContractDeclaration[],
  file: string,
  fs: FileSystem,
  cwd: string,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  // Fully strips trailing newlines (to zero) rather than collapsing to one:
  // the materialiser never appends one (packages/core/src/contracts/
  // materialise-view.ts strips it before joining), while a real file
  // conventionally ends with exactly one — stripping to zero on both sides
  // is what makes "no trailing newline" and "one trailing newline" compare
  // equal, not just "two or more" vs "one".
  const normalise = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\n+$/, '');

  for (const decl of declarations) {
    if (decl.path === undefined || decl.viewText === undefined) continue; // no view — nothing to check

    const resolved = `${cwd}/${decl.path}`;
    let current: string;
    try {
      current = await fs.readFile(resolved, 'utf8');
    } catch {
      findings.push({
        file,
        line: decl.line,
        column: decl.column,
        rule: 'contract-view-stale',
        severity: 'error',
        message: `the projected view of "${decl.path}" in ${file} no longer matches — the file could not be read`,
        fixHint: 'Regenerate the design to refresh or remove the stale projection.',
      });
      continue;
    }

    const currentNormalised = normalise(current);
    const projectedNormalised = normalise(decl.viewText);
    // For an excerpt, compare only the leading lines the view claims to show
    // (design §10 — closing this fully would need a whole-file digest, which
    // D-005 rejects on precedent; the residual is recorded, not papered over).
    const compareTarget = decl.viewExcerpt
      ? currentNormalised.split('\n').slice(0, projectedNormalised.split('\n').length).join('\n')
      : currentNormalised;

    if (compareTarget !== projectedNormalised) {
      findings.push({
        file,
        line: decl.line,
        column: decl.column,
        rule: 'contract-view-stale',
        severity: 'error',
        message: `the projected view of "${decl.path}" in ${file} no longer matches the file's current content`,
        fixHint: 'Regenerate the design (spectastic design, or re-run /spectastic.design) to refresh the projection.',
      });
    }
  }

  return findings;
}
