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
const PHASE_US = /^phase-us\d+$/;
const SC_HREF = /spec\.html#(SC-\d+)\b/;
const TASK_HREF = /tasks\.html#(T-\d+)\b/;
const TEST_PATH = /(?:(?:^|\/)tests?\/)|(?:\.(?:test|spec)\.[tj]sx?$)/;

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

function taskPath(task: Element): string {
  for (const span of findAll(task, 'span')) {
    if (getAttr(span, 'class') === 'path') return textOf(span);
  }
  return '';
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

/** The test-task ids that close an SC (the join the engine renders), sorted. */
function closingTestTaskIds(tasks: ParsedDocument): string[] {
  const ids = new Set<string>();
  for (const section of findAll(tasks.ast, 'section')) {
    if (!PHASE_US.test(getAttr(section, 'id') ?? '')) continue;
    const closesAnSc = findAll(section, 'spec-note').some((note) =>
      findAll(note, 'a').some((a) => SC_HREF.test(getAttr(a, 'href') ?? '')),
    );
    if (!closesAnSc) continue;
    for (const task of findAll(section, 'spec-task')) {
      const id = getAttr(task, 'id');
      if (id && TEST_PATH.test(taskPath(task))) ids.add(id);
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
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
  return { scs: [...scs].sort((a, b) => a.localeCompare(b)), tasks: [...tasks].sort((a, b) => a.localeCompare(b)) };
}

const eq = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

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
      const expectedTasks = closingTestTaskIds(b.tasks);
      const linked = linkedIds(b.verify);

      const scDrift = !eq(expectedScs, linked.scs);
      const taskDrift = !eq(expectedTasks, linked.tasks);
      if (!scDrift && !taskDrift) continue;

      const parts: string[] = [];
      if (scDrift) parts.push(`success criteria [${expectedScs.join(', ')}] vs linked [${linked.scs.join(', ')}]`);
      if (taskDrift) parts.push(`test tasks [${expectedTasks.join(', ')}] vs linked [${linked.tasks.join(', ')}]`);
      const head = findAll(b.verify.ast, 'h1')[0] ?? findAll(b.verify.ast, 'html')[0];
      const loc = head ? getLocation(head) : { line: 1, column: 1 };
      findings.push({
        file: b.verify.file,
        line: loc.line,
        column: loc.column,
        rule: 'verify-view-stale',
        severity: 'error',
        message: `verify.html is stale — ${parts.join('; ')}`,
        fixHint: `Regenerate with \`spectastic verify ${b.specId}\` so the trace matches the current spec/tasks.`,
      });
    }
    return findings;
  },
};
