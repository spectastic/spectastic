import { findAll, getAttr, getLocation, walk } from '../parser.js';
import type { Element } from '../parser.js';
import type { CrossFileRule, Finding, ParsedDocument } from '../types.js';

/**
 * Flag a `verify.html` whose derived trace links no longer match the current
 * `SC-NNN` / test-task IDs in its sibling `spec.html` + `tasks.html` (spec
 * 021-verify-view, FR-008). `verify.html` is a generated view; when the bundle
 * moves and the view isn't regenerated, this rule makes the drift loud — the
 * linter-is-not-noise discipline (D-004).
 *
 * Live ID-set comparison, no stored fingerprint: the rule re-derives the
 * expected SC + closing-test-task id sets from the bundle and compares them to
 * the ids `verify.html` actually links. Cross-file by nature — it only runs
 * when the verify view and its siblings are in the validated set together.
 */

const SPEC_FILE = /(?:^|\/)specs\/([^/]+)\/spec\.html$/;
const TASKS_FILE = /(?:^|\/)specs\/([^/]+)\/tasks\.html$/;
const VERIFY_FILE = /(?:^|\/)specs\/([^/]+)\/verify\.html$/;
const SC_ID = /^SC-\d+$/;
const NFR_ID = /^NFR-\d+$/;
const PHASE_US = /^phase-us\d+$/;
const SC_HREF = /spec\.html#(SC-\d+)\b/;
const TASK_HREF = /tasks\.html#(T-\d+)\b/;
const NFR_HREF = /spec\.html#(NFR-\d+)\b/;
// Mirror the generator: a test task is identified by the story's Tests subsection,
// not by file path (021 FR-003). Tolerant leading-"Tests" match.
const TESTS_HEADING = /^tests\b/i;
// FR-003 fallback (mirrors the generator): when a phase declares NO Tests subsection,
// a task whose declared path matches this pattern is a test task. Gated on absence,
// so fixtures (under a subsection) never reach it.
const TEST_PATH = /\.(test|spec)\./;

/** A spec slice's bundle docs, grouped by spec id. */
interface Bundle {
  specId: string;
  spec?: ParsedDocument;
  tasks?: ParsedDocument;
  verify?: ParsedDocument;
}

function groupBundles(docs: readonly ParsedDocument[]): Map<string, Bundle> {
  const bundles = new Map<string, Bundle>();
  const slot = (id: string): Bundle => {
    const existing = bundles.get(id);
    if (existing) return existing;
    const fresh: Bundle = { specId: id };
    bundles.set(id, fresh);
    return fresh;
  };
  for (const doc of docs) {
    const s = SPEC_FILE.exec(doc.file);
    if (s?.[1]) { slot(s[1]).spec = doc; continue; }
    const t = TASKS_FILE.exec(doc.file);
    if (t?.[1]) { slot(t[1]).tasks = doc; continue; }
    const v = VERIFY_FILE.exec(doc.file);
    if (v?.[1]) slot(v[1]).verify = doc;
  }
  return bundles;
}

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

/** The SC ids the spec declares, sorted. */
function specScIds(spec: ParsedDocument): string[] {
  const ids = new Set<string>();
  for (const req of findAll(spec.ast, 'spec-requirement')) {
    const id = getAttr(req, 'id');
    if (id && SC_ID.test(id)) ids.add(id);
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

/**
 * The NFR ids referenced by a `<spec-slo target=…>` in the spec, sorted
 * (048-verify-slo-trace, FR-004). An NFR with no `<spec-slo>` at all is not
 * in this set — it's a gap the §Observables trace renders, not a drift the
 * stale rule reasons about (the trace still shows it; there's just nothing
 * to compare against verify.html's links).
 */
function specSloTargetIds(spec: ParsedDocument): string[] {
  const ids = new Set<string>();
  for (const slo of findAll(spec.ast, 'spec-slo')) {
    const target = getAttr(slo, 'target');
    if (target && NFR_ID.test(target)) ids.add(target);
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
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
 * Test-task ids in one phase (021 FR-003), mirroring the generator. PRIMARY: the
 * tasks under the story's Tests subsection (DOM-bounded). FALLBACK: when the phase
 * declares no Tests subsection, identify by path (`.test.` / `.spec.`) — gated on
 * the subsection's absence, so fixtures are never path-filtered.
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
 * The per-SC join the generator renders: each `SC-NNN` a `phase-usN` note cites maps
 * to that phase's Tests-subsection task ids. Per-SC (not a flat union), so the
 * completeness check reasons over the same mapping the view shows (021 §2 of the
 * trace-by-tests-section change).
 */
function perScTestTasks(tasks: ParsedDocument): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const section of findAll(tasks.ast, 'section')) {
    if (!PHASE_US.test(getAttr(section, 'id') ?? '')) continue;
    const testIds = collectTestTasks(section);
    for (const note of findAll(section, 'spec-note')) {
      for (const a of findAll(note, 'a')) {
        const m = SC_HREF.exec(getAttr(a, 'href') ?? '');
        if (m?.[1]) map.set(m[1], testIds);
      }
    }
  }
  return map;
}

/** The SC / test-task ids `verify.html` actually links, each sorted. */
function linkedIds(verify: ParsedDocument): { scs: string[]; tasks: string[] } {
  const scs = new Set<string>();
  const tasks = new Set<string>();
  for (const a of findAll(verify.ast, 'a')) {
    const href = getAttr(a, 'href') ?? '';
    const sc = SC_HREF.exec(href);
    if (sc?.[1]) scs.add(sc[1]);
    const t = TASK_HREF.exec(href);
    if (t?.[1]) tasks.add(t[1]);
  }
  return {
    scs: [...scs].sort((a, b) => a.localeCompare(b)),
    tasks: [...tasks].sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * The NFR ids `verify.html`'s §Observables section links to a genuinely
 * TRACED `<spec-slo>` row — not any NFR anchor. A gap row (048 FR-001) also
 * links its NFR id (`observablesGapRow`, so a reader can still jump to the
 * requirement even with no SLO), so a flat any-anchor scan would wrongly
 * count every gap as "linked with an SLO" and false-positive drift on a spec
 * whose NFRs simply have no SLOs yet. Traced rows render 4 plain `<td>`s;
 * gap rows render a `<td colspan="3">` — that structural marker is what
 * distinguishes them, not the presence of a link.
 */
function linkedSloNfrIds(verify: ParsedDocument): string[] {
  const nfrs = new Set<string>();
  const section = findAll(verify.ast, 'section').find((s) => getAttr(s, 'id') === 'observables');
  if (!section) return [];
  for (const tr of findAll(section, 'tr')) {
    const isGapRow = findAll(tr, 'td').some((td) => getAttr(td, 'colspan') !== undefined);
    if (isGapRow) continue;
    for (const a of findAll(tr, 'a')) {
      const nfr = NFR_HREF.exec(getAttr(a, 'href') ?? '');
      if (nfr?.[1]) nfrs.add(nfr[1]);
    }
  }
  return [...nfrs].sort((a, b) => a.localeCompare(b));
}

const eq = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

interface Loc {
  line: number;
  column: number;
}

/** Drift (consistency): the view's links no longer match the bundle's ids. */
function driftFinding(
  verify: ParsedDocument,
  specId: string,
  expectedScs: string[],
  expectedTasks: string[],
  linked: { scs: string[]; tasks: string[] },
  loc: Loc,
): Finding | null {
  const scDrift = !eq(expectedScs, linked.scs);
  const taskDrift = !eq(expectedTasks, linked.tasks);
  if (!scDrift && !taskDrift) return null;
  const parts: string[] = [];
  if (scDrift) parts.push(`success criteria [${expectedScs.join(', ')}] vs linked [${linked.scs.join(', ')}]`);
  if (taskDrift) parts.push(`test tasks [${expectedTasks.join(', ')}] vs linked [${linked.tasks.join(', ')}]`);
  return {
    file: verify.file,
    line: loc.line,
    column: loc.column,
    rule: 'verify-view-stale',
    severity: 'error',
    message: `verify.html is stale — ${parts.join('; ')}`,
    fixHint: `Regenerate with \`spectastic verify ${specId}\` so the trace matches the current spec/tasks.`,
  };
}

/**
 * Observables drift (048-verify-slo-trace, FR-004): the NFR ids `verify.html`'s
 * §Observables section links no longer match the NFR ids the spec's
 * `<spec-slo target=…>`s actually reference. Mirrors `driftFinding` exactly.
 * An empty expected set (no `<spec-slo>` anywhere) never fires — a bundle
 * that predates 047, or that genuinely has no SLOs, is not stale by this leg.
 */
function observablesDriftFinding(
  verify: ParsedDocument,
  specId: string,
  expectedNfrs: string[],
  linkedNfrs: string[],
  loc: Loc,
): Finding | null {
  // A pre-047 or genuinely SLO-less bundle has both sets empty — eq([],[])
  // is true, so it's never flagged (NFR-002). A bundle with real drift in
  // either direction (gained/lost an SLO without regenerating) still fires.
  if (eq(expectedNfrs, linkedNfrs)) return null;
  return {
    file: verify.file,
    line: loc.line,
    column: loc.column,
    rule: 'verify-view-stale',
    severity: 'error',
    message: `verify.html is stale — observables NFRs [${expectedNfrs.join(', ')}] vs linked [${linkedNfrs.join(', ')}]`,
    fixHint: `Regenerate with \`spectastic verify ${specId}\` so the §Observables trace matches the current <spec-slo> set.`,
  };
}

/**
 * Completeness (021 FR-008): a closed SC resolving to no test task is a loud gap, not
 * a silent pass — gated on the bundle being test-bearing (≥1 test task), so a
 * genuinely test-less spec is exempt. Per-SC, matching what the view shows.
 */
function completenessFinding(
  verify: ParsedDocument,
  specId: string,
  perSc: Map<string, string[]>,
  expectedTasks: string[],
  loc: Loc,
): Finding | null {
  if (expectedTasks.length === 0) return null;
  const emptyScs = [...perSc.entries()]
    .filter(([, ids]) => ids.length === 0)
    .map(([sc]) => sc)
    .sort((a, b) => a.localeCompare(b));
  if (emptyScs.length === 0) return null;
  const plural = emptyScs.length > 1;
  return {
    file: verify.file,
    line: loc.line,
    column: loc.column,
    rule: 'verify-view-stale',
    severity: 'error',
    message: `verify.html trace is incomplete — closed success criteri${plural ? 'a' : 'on'} [${emptyScs.join(', ')}] resolve to no test task`,
    fixHint: `Add a test task under the user story's Tests subsection that closes ${plural ? 'each' : 'it'}, then regenerate with \`spectastic verify ${specId}\`.`,
  };
}

export const verifyViewStaleRule: CrossFileRule = {
  id: 'verify-view-stale',
  scope: 'cross-file',
  defaultSeverity: 'error',
  description:
    'verify.html must link the same SC / test-task IDs the sibling spec.html + tasks.html currently carry; regenerate when they drift.',
  check({ docs }): Finding[] {
    const findings: Finding[] = [];
    for (const b of groupBundles(docs).values()) {
      // Need the view AND both siblings to compare; otherwise no signal.
      if (!b.verify || !b.spec || !b.tasks) continue;

      const expectedScs = specScIds(b.spec);
      const perSc = perScTestTasks(b.tasks);
      const expectedTasks = [...new Set([...perSc.values()].flat())].sort((a, b) => a.localeCompare(b));
      const linked = linkedIds(b.verify);
      const head = findAll(b.verify.ast, 'h1')[0] ?? findAll(b.verify.ast, 'html')[0];
      const loc = head ? getLocation(head) : { line: 1, column: 1 };

      const drift = driftFinding(b.verify, b.specId, expectedScs, expectedTasks, linked, loc);
      if (drift) findings.push(drift);
      const incomplete = completenessFinding(b.verify, b.specId, perSc, expectedTasks, loc);
      if (incomplete) findings.push(incomplete);
      const expectedNfrs = specSloTargetIds(b.spec);
      const observablesDrift = observablesDriftFinding(b.verify, b.specId, expectedNfrs, linkedSloNfrIds(b.verify), loc);
      if (observablesDrift) findings.push(observablesDrift);
    }
    return findings;
  },
};
