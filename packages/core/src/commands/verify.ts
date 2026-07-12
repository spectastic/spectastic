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
import { isQuantifiedTarget } from '@spectastic/schema/slo';
import type { CapturedRun, FileSystem, KernelContext, VerifyInput, VerifyResult } from '../types.js';

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

/**
 * One `<spec-slo target="NFR-NNN">`'s read fields (047-slo-nfr-artifact
 * FR-001). Attributes only where present — a malformed SLO (missing a
 * required field) is `slo-well-formed`'s concern, not ours; we just surface
 * whatever is there.
 */
export interface SloInfo {
  target: string;
  objective?: string;
  window?: string;
  budgeting?: string;
  signal?: string;
  /** The SLI — the element's own content. */
  sli: string;
}

/**
 * One row of the §Observables trace (048-verify-slo-trace, D-001): an NFR,
 * the `<spec-slo>`(s) refining it (if any), and — when there are none — a
 * quantified-aware gap classification (FR-001).
 */
export interface ObservablesRow {
  nfrId: string;
  /** SLOs targeting this NFR, in document order. Empty when none link here. */
  slos: SloInfo[];
  /**
   * Set only when `slos` is empty: `'loud'` when the NFR reads as a
   * measurable target (`isQuantifiedTarget` against its prose OR its `slo=`
   * light annotation, 047 FR-003 — a bare `slo=` string satisfies 047's
   * minimal quantified gate but still has no SLI/window/signal to trace
   * here, so it is correctly a gap at this fuller bar), `'quiet'` otherwise
   * (not a reliability target — an SLO would be optional enrichment).
   */
  gap?: 'loud' | 'quiet';
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
  /** The NFR -> SLO §Observables trace (048), one row per NFR in document order. */
  observables: ObservablesRow[];
}

// --- reader (T-010) ----------------------------------------------------

const SC_ID = /^SC-\d+$/;
const US_ANCHOR = /^US(\d+)$/;
const PHASE_US = /^phase-us(\d+)$/;
const SC_HREF = /#(SC-\d+)\b/;
// A test task is identified structurally — by the story's Tests subsection — not by
// file path (021 FR-003), so fixture-driven tests (paths under fixtures/) are
// recognised. Tolerant leading-"Tests" match so a reworded heading suffix is fine.
const TESTS_HEADING = /^tests\b/i;
// FR-003 fallback: when a phase declares NO Tests subsection, a task whose declared
// path matches this test-file pattern is recognised as a test task. Gated on the
// subsection's absence, so fixtures (which live under a subsection) never reach it.
const TEST_PATH = /\.(test|spec)\./;

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

/** Every `SC-NNN` requirement id in the spec, in document order. */
function extractScIds(ast: Document): string[] {
  const ids: string[] = [];
  for (const req of findAll(ast, 'spec-requirement')) {
    const id = getAttr(req, 'id');
    if (id && SC_ID.test(id)) ids.push(id);
  }
  return ids;
}

const NFR_ID = /^NFR-\d+$/;

/** Read one `<spec-slo>` element into its `SloInfo` (047 FR-001 shape). */
function readSloInfo(slo: Element): SloInfo {
  const objective = getAttr(slo, 'objective');
  const window = getAttr(slo, 'window');
  const budgeting = getAttr(slo, 'budgeting');
  const signal = getAttr(slo, 'signal');
  return {
    target: getAttr(slo, 'target') ?? '',
    sli: textOf(slo),
    ...(objective !== undefined ? { objective } : {}),
    ...(window !== undefined ? { window } : {}),
    ...(budgeting !== undefined ? { budgeting } : {}),
    ...(signal !== undefined ? { signal } : {}),
  };
}

/** Every `<spec-slo target=…>`, grouped by the NFR id it refines. */
function extractSlosByTarget(ast: Document): Map<string, SloInfo[]> {
  const map = new Map<string, SloInfo[]>();
  for (const slo of findAll(ast, 'spec-slo')) {
    const target = getAttr(slo, 'target');
    if (!target) continue; // no target= — slo-target-required's concern, not ours
    const info = readSloInfo(slo);
    const list = map.get(target);
    if (list) list.push(info);
    else map.set(target, [info]);
  }
  return map;
}

/**
 * The §Observables trace (048, FR-001): one row per NFR, with its linked
 * SLOs or — when there are none — a quantified-aware gap. `isQuantifiedTarget`
 * is checked against the NFR's own prose AND its `slo=` attribute (047's
 * combined check), so classification agrees with 047's own quantified-NFR
 * gate about what "looks like a reliability target" means.
 */
function extractObservables(ast: Document): ObservablesRow[] {
  const nfrs = findAll(ast, 'spec-requirement').filter((el) => NFR_ID.test(getAttr(el, 'id') ?? ''));
  const slosByTarget = extractSlosByTarget(ast);
  return nfrs.map((nfr) => {
    const nfrId = getAttr(nfr, 'id') ?? '';
    const slos = slosByTarget.get(nfrId) ?? [];
    if (slos.length > 0) return { nfrId, slos };
    const sloAttr = getAttr(nfr, 'slo') ?? '';
    const quantified = isQuantifiedTarget(textOf(nfr)) || isQuantifiedTarget(sloAttr);
    return { nfrId, slos, gap: quantified ? ('loud' as const) : ('quiet' as const) };
  });
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

/** The declared path of a task — the text of its `<span class="path">`, if any. */
function taskPath(task: Element): string {
  let path = '';
  walk(task, (el) => {
    if (el.tagName === 'span' && /\bpath\b/.test(getAttr(el, 'class') ?? '')) {
      path = textOf(el);
    }
  });
  return path;
}

/**
 * The test-task ids inside one phase section (021 FR-003). PRIMARY: the tasks
 * under the story's `<h3>Tests …</h3>` subsection, DOM-bounded — a `<spec-task>`
 * counts only while the nearest preceding `<h3>` is the Tests heading, so
 * Implementation-subsection tasks are excluded and fixture-driven paths trace.
 * FALLBACK: when the phase declares NO Tests subsection, identify test tasks by
 * path (`.test.` / `.spec.`). Gated on the subsection's absence, so fixtures —
 * which live under a subsection — are never path-filtered here.
 */
function collectTestTasks(section: Element): string[] {
  const subsection: string[] = [];
  let hasTestsHeading = false;
  let inTests = false;
  walk(section, (el) => {
    if (el.tagName === 'h3') {
      inTests = TESTS_HEADING.test(textOf(el));
      if (inTests) hasTestsHeading = true;
    } else if (el.tagName === 'spec-task' && inTests) {
      const id = getAttr(el, 'id');
      if (id) subsection.push(id);
    }
  });
  if (hasTestsHeading) return subsection;
  const byPath: string[] = [];
  walk(section, (el) => {
    if (el.tagName === 'spec-task') {
      const id = getAttr(el, 'id');
      if (id && TEST_PATH.test(taskPath(el))) byPath.push(id);
    }
  });
  return byPath;
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
    observables: extractObservables(spec.ast),
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
  // Spec 021 T-003: a block whose commands were NOT run is marked suggested so
  // it never presents unverified commands with the authority of verified ones
  // (P-7). Default is verified (a /implement capture ran them); only an explicit
  // verified:false downgrades the block.
  const suggested = c.verified === false;
  const status = suggested ? ' data-status="suggested"' : '';
  const banner = suggested
    ? '\n  <spec-note><strong>Suggested — not yet run.</strong> These commands were authored, not executed; verify them before trusting the result (<a href="../../principles.html#P-7">P-7</a>).</spec-note>'
    : '';
  return `<spec-runblock${status}>${banner}
  <spec-run>${field(c.run)}</spec-run>
  <spec-toggle>${field(c.toggle)}</spec-toggle>
  <spec-tests${cites(c.testsCite)}>${field(c.tests)}</spec-tests>
  <spec-demo${cites(c.demoCite)}>${field(c.demo)}</spec-demo>
</spec-runblock>`;
}

/**
 * The instrumentation evidence for the §Observables trace (048, FR-002).
 * Clones `renderRunBlock`'s contract exactly — same empty-field / suggested
 * mechanics — for the per-project metrics capture: one endpoint + the golden
 * signals actually observed, covering every SLO the run checked.
 */
export function renderObserved(observables: CapturedRun['observables']): string {
  const o = observables ?? {};
  const field = (val?: string): string => (val ? escapeHtml(val) : '');
  // slosCite isn't surfaced in this block — it identifies which SLOs the
  // capture speaks to for the (future) cross-check logic, not a display
  // citation the way tests/demo's cites are; the render stays simple.
  const suggested = o.verified === false;
  const status = suggested ? ' data-status="suggested"' : '';
  const banner = suggested
    ? '\n  <spec-note><strong>Suggested — not yet run.</strong> This endpoint was not actually queried; verify it before trusting the result (<a href="../../principles.html#P-7">P-7</a>).</spec-note>'
    : '';
  return `<spec-observed-block${status}>${banner}
  <spec-observed-endpoint>${field(o.endpoint)}</spec-observed-endpoint>
  <spec-observed-signals>${field(o.signals?.join(', '))}</spec-observed-signals>
</spec-observed-block>`;
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

/** A loud gap in the §Observables trace, reusing TRACE_GAP's visual pattern with an NFR-specific message. */
const observablesGap = (nfrId: string): string =>
  `<strong style="color:var(--c-deprecated,#b0392a);font-style:italic;">— ${nfrId} is quantified but has no linked &lt;spec-slo&gt; —</strong>`;

/** Compact display of an SLO's objective/window/budgeting fields. */
function sloSummary(slo: SloInfo): string {
  const bits: string[] = [];
  if (slo.objective) bits.push(escapeHtml(slo.objective));
  if (slo.window) bits.push(`over ${escapeHtml(slo.window)}`);
  if (slo.budgeting) bits.push(`(${escapeHtml(slo.budgeting)})`);
  return bits.length > 0 ? bits.join(' ') : '—';
}

/**
 * The signal cell: the declared signal, cross-checked against the captured
 * observed-signals set (048, FR-003, US3, D-003). `observedSignals` is
 * `undefined` when the cross-check should NOT run — no capture, or the
 * capture is suggested (`verified:false`): a signal the run never checked
 * means "not checked", not "not emitted", so it renders plainly, never a gap.
 */
function signalCell(slo: SloInfo, observedSignals: Set<string> | undefined): string {
  if (!slo.signal) return '<span style="color:var(--c-muted);">—</span>';
  if (observedSignals && !observedSignals.has(slo.signal)) {
    return `<strong style="color:var(--c-deprecated,#b0392a);font-style:italic;">— declared signal "${escapeHtml(slo.signal)}" was not observed —</strong>`;
  }
  return `<code>${escapeHtml(slo.signal)}</code>`;
}

/** One §Observables row for a linked SLO: NFR -> objective/window/budgeting -> SLI -> signal. */
function sloRow(nfrId: string, slo: SloInfo, observedSignals: Set<string> | undefined): string {
  const signal = signalCell(slo, observedSignals);
  return `    <tr><td><a href="./spec.html#${nfrId}">${nfrId}</a></td><td>${sloSummary(slo)}</td><td>${escapeHtml(slo.sli)}</td><td>${signal}</td></tr>`;
}

/** One §Observables row for an NFR with no linked SLO — a loud or quiet gap (FR-001). */
function observablesGapRow(row: ObservablesRow): string {
  const cell =
    row.gap === 'loud'
      ? observablesGap(row.nfrId)
      : '<span style="color:var(--c-muted);">n/a</span>';
  return `    <tr><td><a href="./spec.html#${row.nfrId}">${row.nfrId}</a></td><td colspan="3">${cell}</td></tr>`;
}

/**
 * The §Observables trace (048-verify-slo-trace, FR-001): each NFR -> its
 * linked SLO(s) — one row per SLO, since multiple SLOs per NFR are each
 * independently traced (US1 edge case) — or a quantified-aware gap. Mirrors
 * `renderTrace`'s shape; a spec with zero NFRs (nothing to trace) renders a
 * "no SLOs declared" note instead of an empty table (NFR-002) — an NFR that
 * merely lacks an SLO still gets its real gap row, since burying that would
 * hide exactly the signal FR-001 exists to surface.
 */
export function renderObservables(model: BundleModel, captured: VerifyInput['capturedRun']): string {
  if (model.observables.length === 0) {
    return '<p>No SLOs declared — this spec carries no <code>&lt;spec-slo&gt;</code>-eligible NFRs.</p>';
  }
  const obs = captured?.observables;
  // undefined (no cross-check) unless a capture exists AND it was actually run.
  const observedSignals = obs && obs.verified !== false ? new Set(obs.signals ?? []) : undefined;
  const rows = model.observables
    .flatMap((row) =>
      row.slos.length > 0 ? row.slos.map((slo) => sloRow(row.nfrId, slo, observedSignals)) : [observablesGapRow(row)],
    )
    .join('\n');
  return `<table>
  <thead><tr><th>NFR</th><th>Objective</th><th>SLI</th><th>Signal</th></tr></thead>
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


<section id="observables">
<h2>3 · Observables trace</h2>
<p>Every reliability NFR, traced to its SLO (objective, window, SLI, signal) and — for a quantified NFR with none — a loud gap. The instrumentation evidence below grounds it in the real run.</p>
${renderObserved(captured?.observables)}
${renderObservables(model, captured)}
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
const OBSERVABLES_BLOCK_RE = /<spec-observed-block>[\s\S]*?<\/spec-observed-block>/;

/** Extract the authored Run/Demo block from an existing verify.html, if any. */
function extractRunBlock(html: string): string | undefined {
  return RUNBLOCK_RE.exec(html)?.[0];
}

/** Extract the authored observables capture from an existing verify.html, if any (048 NFR-001). */
function extractObservedBlock(html: string): string | undefined {
  return OBSERVABLES_BLOCK_RE.exec(html)?.[0];
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
  // PRESERVE the Run/Demo block the last /implement captured (FR-006), and
  // likewise the observables capture (048 NFR-001).
  if (!input.capturedRun) {
    const existing = await readFileSafe(fs, join(dir, 'verify.html'));
    const preservedRun = existing ? extractRunBlock(existing) : undefined;
    if (preservedRun) html = html.replace(RUNBLOCK_RE, () => preservedRun);
    const preservedObserved = existing ? extractObservedBlock(existing) : undefined;
    if (preservedObserved) html = html.replace(OBSERVABLES_BLOCK_RE, () => preservedObserved);
  }

  return { specId: input.specId, html };
}
