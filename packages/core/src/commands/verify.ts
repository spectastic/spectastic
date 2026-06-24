/**
 * Kernel for `spectastic verify <spec-id>` (spec 021-verify-view). Generates
 * the derived per-spec verify.html: it AGGREGATES the bundle's
 * SC -> acceptance -> test-task trace by reference (FR-002, FR-003) and MERGES
 * the real-run Run/Demo block /implement captured (FR-004, FR-005), preserving
 * that block on a links-only regeneration (FR-006).
 *
 * Deterministic and stub-free: it reads spec.html / tasks.html through ctx.fs
 * and returns the rendered html for the CLI to write. Plan D-001 (engine in
 * core, thin CLI wrapper) + D-002 (the test task is the SC -> US join key).
 */

import { join } from 'node:path';
import { parse, findAll, getAttr, walk } from '@spectastic/schema/parser';
import type { Document, Element } from '@spectastic/schema/parser';
import type { FileSystem, KernelContext, VerifyInput, VerifyResult } from '../types.js';

export class VerifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VerifyError';
  }
}

// --- model -------------------------------------------------------------

/** One row of the SC -> acceptance -> test-task trace (D-002). */
export interface TraceRow {
  /** The success-criterion id, e.g. "SC-001". */
  scId: string;
  /**
   * The user-story number this SC traces to, derived from the phase whose
   * closing note cites the SC (`phase-usN`). Undefined when no phase closes
   * it — a loud gap (R-1 / FR-009).
   */
  usNum?: number;
  /** Whether the spec carries an `id="USn"` anchor for the acceptance link. */
  usAnchorPresent: boolean;
  /** The test-task ids in that phase (the proof leg). */
  testTaskIds: string[];
}

/** The structured bundle the renderer consumes. Pure derivation. */
export interface BundleModel {
  specId: string;
  /** The spec's `<spec-status>` value, surfaced as the derived status (FR-007). */
  specStatus: string;
  /** The spec's `<h1>` title. */
  title: string;
  /** Every `SC-NNN` in the spec, in document order. */
  scIds: string[];
  /** The SC -> acceptance -> test trace. */
  trace: TraceRow[];
}

// --- reader (T-010) ----------------------------------------------------

const SC_ID = /^SC-\d+$/;
const US_ANCHOR = /^US(\d+)$/;
const PHASE_US = /^phase-us(\d+)$/;
const SC_HREF = /#(SC-\d+)\b/;
const TEST_PATH = /(?:(?:^|\/)tests?\/)|(?:\.(?:test|spec)\.[tj]sx?$)/;

/** What a phase closes + the test tasks that prove it (the SC -> US join). */
interface PhaseHit {
  usNum: number;
  testTaskIds: string[];
}

/** Concatenate the text content of an element, depth-first. */
function textOf(el: Element): string {
  let out = '';
  walk(el, (node) => {
    for (const child of node.childNodes) {
      if ('value' in child && typeof child.value === 'string' && !('tagName' in child)) {
        out += child.value;
      }
    }
  });
  return out.replace(/\s+/g, ' ').trim();
}

/** Read the document's `<h1>` text, or a fallback. */
function readTitle(ast: Document, fallback: string): string {
  const h1 = findAll(ast, 'h1')[0];
  return h1 ? textOf(h1) : fallback;
}

/** The `class="path"` text of a task, used to tell a test task from an impl task. */
function taskPath(task: Element): string {
  for (const span of findAll(task, 'span')) {
    if (getAttr(span, 'class') === 'path') return textOf(span);
  }
  return '';
}

/** Every `SC-NNN` requirement id in the spec, in document order. */
function extractScIds(ast: Document): string[] {
  const ids: string[] = [];
  for (const req of findAll(ast, 'spec-requirement')) {
    const id = getAttr(req, 'id');
    if (id && SC_ID.test(id)) ids.push(id);
  }
  return ids;
}

/** The set of user-story numbers the spec carries an `id="USn"` anchor for. */
function extractUsAnchors(ast: Document): Set<number> {
  const set = new Set<number>();
  for (const h of [...findAll(ast, 'h3'), ...findAll(ast, 'h2')]) {
    const m = US_ANCHOR.exec(getAttr(h, 'id') ?? '');
    if (m?.[1]) set.add(Number(m[1]));
  }
  return set;
}

/** The test-task ids inside one phase section (path looks like a test). */
function collectTestTasks(section: Element): string[] {
  const ids: string[] = [];
  for (const task of findAll(section, 'spec-task')) {
    const id = getAttr(task, 'id');
    if (id && TEST_PATH.test(taskPath(task))) ids.push(id);
  }
  return ids;
}

/**
 * Map each closed `SC-NNN` to the phase that closes it: the test task is the
 * join key (D-002). A `phase-usN` section's closing `<spec-note>` cites the
 * SCs it closes; the phase id names the user story; its test tasks are proof.
 */
function extractPhaseMap(ast: Document): Map<string, PhaseHit> {
  const map = new Map<string, PhaseHit>();
  for (const section of findAll(ast, 'section')) {
    const m = PHASE_US.exec(getAttr(section, 'id') ?? '');
    if (!m?.[1]) continue;
    const hit: PhaseHit = { usNum: Number(m[1]), testTaskIds: collectTestTasks(section) };
    for (const note of findAll(section, 'spec-note')) {
      for (const a of findAll(note, 'a')) {
        const hm = SC_HREF.exec(getAttr(a, 'href') ?? '');
        if (hm?.[1]) map.set(hm[1], hit);
      }
    }
  }
  return map;
}

/**
 * Parse a spec + tasks bundle into the trace model (D-002). SCs no phase
 * closes become loud gaps (usNum undefined).
 */
export function readBundle(specHtml: string, tasksHtml: string, specId: string): BundleModel {
  const spec = parse(specHtml, `specs/${specId}/spec.html`);
  const tasks = parse(tasksHtml, `specs/${specId}/tasks.html`);

  const scIds = extractScIds(spec.ast);
  const usAnchors = extractUsAnchors(spec.ast);
  const phaseOfSc = extractPhaseMap(tasks.ast);

  const trace: TraceRow[] = scIds.map((scId) => {
    const hit = phaseOfSc.get(scId);
    return {
      scId,
      ...(hit ? { usNum: hit.usNum } : {}),
      usAnchorPresent: hit ? usAnchors.has(hit.usNum) : false,
      testTaskIds: hit ? hit.testTaskIds : [],
    };
  });

  return {
    specId,
    specStatus: spec.status ?? 'unknown',
    title: readTitle(spec.ast, specId),
    scIds,
    trace,
  };
}

// --- render (T-013 shell; Run block T-110; trace T-210) ----------------

const ASSETS = '../../assets';

/** Escape text for safe interpolation into HTML. */
function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * The typed Run/Demo block (FR-004). T-013 emits the empty structure — each
 * field renders loudly as "not recorded" via CSS (FR-009); T-110 populates it
 * from the captured run.
 */
export function renderRunBlock(captured: VerifyInput['capturedRun']): string {
  const c = captured ?? {};
  // An absent field stays an EMPTY element (no whitespace) so CSS :empty
  // renders it loudly (FR-009); cites come from the captured ids (FR-004).
  const field = (val?: string): string => (val ? escapeHtml(val) : '');
  const cites = (ids?: string[]): string =>
    ids && ids.length > 0 ? ` cites="${escapeHtml(ids.join(' '))}"` : '';
  return `<spec-runblock>
  <spec-run>${field(c.run)}</spec-run>
  <spec-toggle>${field(c.toggle)}</spec-toggle>
  <spec-tests${cites(c.testsCite)}>${field(c.tests)}</spec-tests>
  <spec-demo${cites(c.demoCite)}>${field(c.demo)}</spec-demo>
</spec-runblock>`;
}

const TRACE_GAP =
  '<strong style="color:var(--c-deprecated,#b0392a);font-style:italic;">— no test task cites this SC —</strong>';

/** The acceptance leg: link to the user story's anchor, or #scenarios fallback (D-003). */
function acceptanceCell(r: TraceRow): string {
  if (r.usNum === undefined) return TRACE_GAP;
  const anchor = r.usAnchorPresent ? `US${r.usNum}` : 'scenarios';
  return `<a href="./spec.html#${anchor}">US${r.usNum}</a>`;
}

/** The proof leg: links to the closing test task(s), or a loud gap (R-1). */
function proofCell(r: TraceRow): string {
  if (r.testTaskIds.length === 0) return TRACE_GAP;
  return r.testTaskIds.map((t) => `<a href="./tasks.html#${t}">${t}</a>`).join(', ');
}

/**
 * The SC -> acceptance -> test trace (FR-002, FR-003): links only, never copied
 * prose. The acceptance and proof legs both derive from the citing test task
 * (D-002); an SC no task closes renders as a loud gap, never silently.
 */
export function renderTrace(model: BundleModel): string {
  const rows = model.trace
    .map(
      (r) =>
        `    <tr><td><a href="./spec.html#${r.scId}">${r.scId}</a></td><td>${acceptanceCell(
          r,
        )}</td><td>${proofCell(r)}</td></tr>`,
    )
    .join('\n');
  return `<table>
  <thead><tr><th>Success criterion</th><th>Acceptance</th><th>Proof (tests)</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table>`;
}

/**
 * Assemble the full, self-contained verify.html (FR-001). Deterministic — no
 * timestamps or unstable ordering — so regeneration is byte-identical on an
 * unchanged bundle (NFR-002). Carries no own &lt;spec-status&gt;; the status is
 * surfaced as derived text (FR-007).
 */
export function renderVerifyHtml(model: BundleModel, captured: VerifyInput['capturedRun']): string {
  const title = escapeHtml(model.title);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Verify</title>
<link rel="stylesheet" href="${ASSETS}/spec.css">
<link rel="icon" type="image/svg+xml" href="${ASSETS}/favicon.svg">
<script src="${ASSETS}/theme-boot.js"></script>
</head>
<body>
<main>

<header>
  <p class="small-caps">Verify · ${escapeHtml(model.specId)}</p>
  <h1>${title}</h1>
  <p style="font-family:var(--font-serif);font-size:1.25rem;font-weight:300;color:var(--c-text-soft);font-style:italic;max-width:var(--measure);">
    How to run, demo, and verify this feature — aggregated from the spec and tasks, with a Run/Demo block grounded in the run that actually happened.
  </p>

  <spec-meta>
    <b>Generated from</b> <span><a href="./spec.html">spec.html</a> · <a href="./tasks.html">tasks.html</a></span>
    <b>Derived status</b> <span>${escapeHtml(model.specStatus)} <small>(from spec.html — this view carries no status of its own)</small></span>
    <b>Read time</b>      <span data-reading-time></span>
  </spec-meta>

  <spec-note>
    <p>A <strong>derived view</strong> — regenerate with <code>spectastic verify ${escapeHtml(model.specId)}</code>; do not hand-edit. The trace links are aggregated from the bundle; only the Run/Demo block is authored, from the real run.</p>
  </spec-note>
</header>


<section id="run">
<h2>1 · Run / Demo</h2>
${renderRunBlock(captured)}
</section>


<section id="trace">
<h2>2 · Verification trace</h2>
<p>Every success criterion, traced to its acceptance scenario and the test task that closes it.</p>
${renderTrace(model)}
</section>


<footer style="margin-top:var(--s-8);padding-top:var(--s-5);border-top:1px solid var(--c-border-soft);font-family:var(--font-sans);font-size:0.78rem;color:var(--c-muted);">
  Verify · ${escapeHtml(model.specId)} · derived view ·
  <button data-theme-toggle style="background:none;border:none;color:var(--c-link);cursor:pointer;font:inherit;padding:0;border-bottom:1px solid currentColor;">light/dark</button>
</footer>

</main>
<script src="${ASSETS}/spec.js"></script>
</body>
</html>
`;
}

// --- command -----------------------------------------------------------

const RUNBLOCK_RE = /<spec-runblock>[\s\S]*?<\/spec-runblock>/;

/** Extract the authored Run/Demo block from an existing verify.html, if any. */
function extractRunBlock(html: string): string | undefined {
  return RUNBLOCK_RE.exec(html)?.[0];
}

/** Read a file, returning undefined if it doesn't exist (no existing view yet). */
async function readFileSafe(fs: FileSystem, path: string): Promise<string | undefined> {
  try {
    return await fs.readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

export async function verifyCommand(
  input: VerifyInput,
  ctx: KernelContext,
): Promise<VerifyResult> {
  // ctx.fs is optional on the kernel context; default to the node wrapper
  // (the apply-verb pattern) so the CLI needn't wire it explicitly.
  const fs = ctx.fs ?? (await import('../providers/node-fs.js')).nodeFs;
  const dir = join(ctx.cwd, 'specs', input.specId);
  const [specHtml, tasksHtml] = await Promise.all([
    fs.readFile(join(dir, 'spec.html'), 'utf8'),
    fs.readFile(join(dir, 'tasks.html'), 'utf8'),
  ]);
  const model = readBundle(specHtml, tasksHtml, input.specId);
  let html = renderVerifyHtml(model, input.capturedRun);

  // Links-only regeneration (no fresh capture): re-derive the trace but
  // PRESERVE the Run/Demo block the last /implement captured (FR-006).
  if (!input.capturedRun) {
    const existing = await readFileSafe(fs, join(dir, 'verify.html'));
    const preserved = existing ? extractRunBlock(existing) : undefined;
    if (preserved) html = html.replace(RUNBLOCK_RE, () => preserved);
  }

  return { specId: input.specId, html };
}
