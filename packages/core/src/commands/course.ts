/**
 * Kernel for `explain --course` (spec 019-explain-course). The agent drafts
 * a course (objectives + quizzes) and hands it to this kernel, which VERIFIES
 * it against the repo, ASSEMBLES a self-contained course.html, and returns it
 * for the CLI to write under .spectastic/courses/.
 *
 * Hybrid surface per plan D-001: generation lives in the in-session agent
 * (commands/spectastic.explain.md --course mode); the testable guarantees —
 * reference existence (FR-003) and quiz guessability (FR-004) — live here and
 * route through the AIProvider factory so the stub drives them in CI.
 *
 * The kernel is stateless: it reports per-item failures (D-002); the agent
 * owns the regenerate-or-drop loop.
 */

import { join } from 'node:path';
import type {
  CourseDraft,
  CourseInput,
  CourseItemFailure,
  CourseObjective,
  CourseQuizItem,
  FileSystem,
  KernelContext,
  CourseResult,
} from '../types.js';

export class CourseDraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CourseDraftError';
  }
}

/** Objectives cap per NFR-001 (≤ ~7 to stay completable in one sitting). */
export const MAX_OBJECTIVES = 7;

export async function courseCommand(
  input: CourseInput,
  ctx: KernelContext,
): Promise<CourseResult> {
  validateCourseDraft(input.draft);
  const slug = deriveSlug(input.draft, ctx);
  const objectivesCount = input.draft.objectives.length;

  const failures: CourseItemFailure[] = [
    ...(await verifyExistence(input.draft, ctx)),
    ...(await verifyGuessability(input.draft, ctx)),
  ];

  if (failures.length > 0) {
    return { slug, failures, objectivesCount };
  }
  const html = assembleCourse(input.draft, slug);
  return { html, slug, failures: [], objectivesCount };
}

/**
 * Load-time validation of the agent's course draft (D-002). Throws a
 * CourseDraftError naming the offending path so a contract-drift bug surfaces
 * loudly rather than producing a broken course. Mirrors the StubAIProvider
 * validator discipline (015 FR-005).
 */
export function validateCourseDraft(draft: unknown): asserts draft is CourseDraft {
  if (draft === null || typeof draft !== 'object' || Array.isArray(draft)) {
    throw new CourseDraftError(`course draft must be an object (got ${describeType(draft)})`);
  }
  const d = draft as Record<string, unknown>;
  if (typeof d['target'] !== 'string' || d['target'].trim() === '') {
    throw new CourseDraftError('course draft.target must be a non-empty string');
  }
  const objectives = d['objectives'];
  if (!Array.isArray(objectives) || objectives.length === 0) {
    throw new CourseDraftError('course draft.objectives must be a non-empty array');
  }
  if (objectives.length > MAX_OBJECTIVES) {
    throw new CourseDraftError(
      `course draft.objectives has ${objectives.length} items; the cap is ${MAX_OBJECTIVES} (NFR-001)`,
    );
  }
  objectives.forEach((obj, i) => {
    const at = `objectives[${i}]`;
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new CourseDraftError(`course draft.${at} must be an object (got ${describeType(obj)})`);
    }
    const o = obj as Record<string, unknown>;
    if (typeof o['title'] !== 'string' || o['title'].trim() === '') {
      throw new CourseDraftError(`course draft.${at}.title must be a non-empty string`);
    }
    if (typeof o['read'] !== 'string' || o['read'].trim() === '') {
      throw new CourseDraftError(`course draft.${at}.read must be a non-empty string`);
    }
    if (!Array.isArray(o['refs'])) {
      throw new CourseDraftError(`course draft.${at}.refs must be an array`);
    }
    (o['refs'] as unknown[]).forEach((r, j) => {
      if (typeof r !== 'string') {
        throw new CourseDraftError(`course draft.${at}.refs[${j}] must be a string`);
      }
    });
    validateQuiz(o['quiz'], `${at}.quiz`);
  });
}

function validateQuiz(quiz: unknown, at: string): void {
  if (quiz === null || typeof quiz !== 'object' || Array.isArray(quiz)) {
    throw new CourseDraftError(`course draft.${at} must be an object (got ${describeType(quiz)})`);
  }
  const q = quiz as Record<string, unknown>;
  if (typeof q['question'] !== 'string' || q['question'].trim() === '') {
    throw new CourseDraftError(`course draft.${at}.question must be a non-empty string`);
  }
  const options = q['options'];
  if (!Array.isArray(options) || options.length < 2) {
    throw new CourseDraftError(`course draft.${at}.options must be an array of ≥2 strings`);
  }
  options.forEach((opt, k) => {
    if (typeof opt !== 'string') {
      throw new CourseDraftError(`course draft.${at}.options[${k}] must be a string`);
    }
  });
  const ci = q['correctIndex'];
  if (typeof ci !== 'number' || !Number.isInteger(ci) || ci < 0 || ci >= options.length) {
    throw new CourseDraftError(
      `course draft.${at}.correctIndex must be an integer in [0, ${options.length - 1}]`,
    );
  }
}

/** Derive the `<date>-<slug>` course directory name. */
export function deriveSlug(draft: CourseDraft, ctx: KernelContext): string {
  const date = courseDate(ctx);
  const base = (draft.slug ?? draft.target)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'course';
  return `${date}-${base}`;
}

function courseDate(ctx: KernelContext): string {
  // Allow a deterministic override for tests via ctx (cwd-relative env is the
  // CLI's concern); default to today.
  return new Date().toISOString().slice(0, 10);
}

// --- T-110 · reference existence (FR-003) -------------------------------

/** A ref is path-like if it contains a slash or ends in a file extension. */
function isPathLike(ref: string): boolean {
  return ref.includes('/') || /\.[a-z0-9]+$/i.test(ref);
}

/**
 * Pure classifier: a ref resolves if a path-like ref exists on disk, or a
 * non-path ref (element ID / spec ID) is a known ID. Returns the refs that
 * resolve to nothing. Kept pure (sync predicates) so it unit-tests without IO.
 */
export function findMissingRefs(
  refs: readonly string[],
  knownIds: ReadonlySet<string>,
  pathExists: (p: string) => boolean,
): string[] {
  return refs.filter((ref) =>
    isPathLike(ref) ? !pathExists(ref) : !knownIds.has(ref),
  );
}

export async function verifyExistence(
  draft: CourseDraft,
  ctx: KernelContext,
): Promise<CourseItemFailure[]> {
  const knownIds = new Set<string>();
  const existingPaths = new Set<string>();
  const fs = ctx.fs;
  if (fs) {
    await gatherKnownIds(fs, ctx.cwd, knownIds);
    const allRefs = [draft.target, ...draft.objectives.flatMap((o) => o.refs)];
    for (const ref of allRefs) {
      if (isPathLike(ref) && (await statKind(fs, join(ctx.cwd, ref))) !== null) {
        existingPaths.add(ref);
      }
    }
  }
  const pathExists = (p: string): boolean => existingPaths.has(p);
  const failures: CourseItemFailure[] = [];

  if (findMissingRefs([draft.target], knownIds, pathExists).length > 0) {
    failures.push({
      objectiveIndex: -1,
      kind: 'missing-ref',
      detail: `target "${draft.target}" does not resolve to real source`,
    });
  }
  draft.objectives.forEach((o, i) => {
    for (const miss of findMissingRefs(o.refs, knownIds, pathExists)) {
      failures.push({ objectiveIndex: i, kind: 'missing-ref', detail: miss });
    }
  });
  return failures;
}

async function gatherKnownIds(
  fs: FileSystem,
  cwd: string,
  out: Set<string>,
): Promise<void> {
  const specsDir = join(cwd, 'specs');
  await walkHtml(fs, specsDir, async (path) => {
    const html = await fs.readFile(path, 'utf8');
    for (const m of html.matchAll(/id="([^"]+)"/g)) {
      if (m[1]) out.add(m[1]);
    }
  });
  // Spec directory names are valid targets/refs (e.g. "015-ai-stub-injection").
  if ((await statKind(fs, specsDir)) === 'dir') {
    for (const name of await fs.readdir(specsDir)) {
      if ((await statKind(fs, join(specsDir, name))) === 'dir') out.add(name);
    }
  }
  const principles = join(cwd, 'principles.html');
  if ((await statKind(fs, principles)) === 'file') {
    const html = await fs.readFile(principles, 'utf8');
    for (const m of html.matchAll(/id="([^"]+)"/g)) {
      if (m[1]) out.add(m[1]);
    }
  }
}

async function walkHtml(
  fs: FileSystem,
  dir: string,
  visit: (path: string) => Promise<void>,
): Promise<void> {
  if ((await statKind(fs, dir)) !== 'dir') return;
  for (const name of await fs.readdir(dir)) {
    const full = join(dir, name);
    const kind = await statKind(fs, full);
    if (kind === 'dir') await walkHtml(fs, full, visit);
    else if (kind === 'file' && name.endsWith('.html')) await visit(full);
  }
}

async function statKind(fs: FileSystem, path: string): Promise<'file' | 'dir' | null> {
  try {
    const s = await fs.stat(path);
    return s.isDirectory ? 'dir' : s.isFile ? 'file' : null;
  } catch {
    return null;
  }
}

// --- T-111 · blind guessability (FR-004 / D-003) ------------------------

/**
 * Pose each quiz item to a fresh, blind AI call (question + options only — no
 * source). If the blind call confidently names the correct option, the item is
 * answerable without the source and is flagged guessable.
 */
export async function verifyGuessability(
  draft: CourseDraft,
  ctx: KernelContext,
): Promise<CourseItemFailure[]> {
  if (!ctx.ai) {
    throw new CourseDraftError('verifyGuessability requires ctx.ai (an AIProvider)');
  }
  const failures: CourseItemFailure[] = [];
  for (let i = 0; i < draft.objectives.length; i++) {
    const quiz = draft.objectives[i]?.quiz;
    if (!quiz) continue;
    const result = await ctx.ai.subagent(blindPrompt(quiz), { task: 'course-guessability' });
    if (blindIndexFrom(result.output) === quiz.correctIndex) {
      failures.push({
        objectiveIndex: i,
        kind: 'guessable',
        detail: quiz.question,
      });
    }
  }
  return failures;
}

function blindPrompt(quiz: CourseQuizItem): string {
  const opts = quiz.options.map((o, k) => `${k}: ${o}`).join('\n');
  return [
    'Answer this multiple-choice question using only general knowledge — you have NOT been shown any source.',
    'If you cannot answer confidently, reply "unsure".',
    '',
    quiz.question,
    opts,
    '',
    'Reply with ONLY the index (a single integer) of the correct option, or "unsure".',
  ].join('\n');
}

/** Extract the blind answer's chosen index; -1 if none/unsure. */
function blindIndexFrom(output: string): number {
  if (/unsure/i.test(output)) return -1;
  const m = output.match(/\d+/);
  return m ? Number.parseInt(m[0], 10) : -1;
}

// --- T-112 · assembly (NFR-002 / FR-005 / FR-007) -----------------------

/** Relative path from a course dir (.spectastic/courses/<slug>/) to assets/. */
const ASSETS = '../../../assets';

/**
 * Inline quiz-gate enhancement (FR-006 / P-4). With JS: a correct answer ticks
 * the objective's mastery checkbox and reveals feedback. With JS off this never
 * runs, so the checkbox stays directly markable and the answer <details> is the
 * self-check — no dead-end (SC-003).
 */
const GATE_SCRIPT = `<script>
/* quiz-gate (019-explain-course FR-006) — enhancement only; degrades to self-mark */
(function () {
  for (const quiz of document.querySelectorAll('.quiz')) {
    const correct = Number(quiz.getAttribute('data-correct'));
    const objId = quiz.getAttribute('data-obj');
    const checkbox = objId ? document.querySelector('#' + objId + ' input[type=checkbox]') : null;
    const answer = quiz.querySelector('.quiz-answer');
    if (answer) answer.hidden = true;
    const verdict = quiz.querySelector('.quiz-verdict');
    quiz.querySelectorAll('input[type=radio]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        const chosen = Number(radio.value);
        const right = chosen === correct;
        quiz.classList.toggle('correct', right);
        quiz.classList.toggle('incorrect', !right);
        if (verdict) {
          const fb = radio.getAttribute('data-feedback');
          verdict.textContent = (right ? '✓ Correct.' : '✗ Not quite.') + (fb ? ' ' + fb : '');
          verdict.hidden = false;
        }
        if (answer) answer.hidden = false;
        if (right && checkbox) checkbox.checked = true;
      });
    });
  }
})();
</script>`;

export function assembleCourse(draft: CourseDraft, slug: string): string {
  const title = draft.title?.trim() || `Course · ${draft.target}`;
  const outcome = draft.outcome?.trim() || `work confidently with ${draft.target}`;
  const date = slug.slice(0, 10);
  const objectives = draft.objectives.map((o, i) => renderObjective(o, i)).join('\n\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Course</title>
<link rel="stylesheet" href="${ASSETS}/spec.css">
<link rel="icon" type="image/svg+xml" href="${ASSETS}/favicon.svg">
<script src="${ASSETS}/theme-boot.js"></script>
</head>
<body>
<main>

<header>
  <p class="small-caps">Course · ${escapeHtml(draft.target)}</p>
  <h1>${escapeHtml(title)}</h1>
  <p style="font-family:var(--font-serif);font-size:1.25rem;font-weight:300;color:var(--c-text-soft);font-style:italic;max-width:var(--measure);">
    By the end you'll be able to ${escapeHtml(outcome)}.
  </p>

  <spec-meta>
    <b>Target</b>      <span>${escapeHtml(draft.target)}</span>
    <b>Objectives</b>  <span>${draft.objectives.length}</span>
    <b>Generated</b>   <span><time datetime="${date}">${date}</time></span>
    <b>Lifetime</b>    <span>Ephemeral — git-ignored; regenerate, don't edit.</span>
    <b>Read time</b>   <span data-reading-time></span>
  </spec-meta>

  <spec-tldr>
    <p>A grounded course on <strong>${escapeHtml(draft.target)}</strong>. Each objective has a reading and a quiz;
    answer the quiz to mark the objective mastered. Everything here is verified against the repository.</p>
  </spec-tldr>
</header>


<section id="objectives">
<h2>Objectives</h2>

${objectives}
</section>


<footer style="margin-top:var(--s-8);padding-top:var(--s-5);border-top:1px solid var(--c-border-soft);font-family:var(--font-sans);font-size:0.78rem;color:var(--c-muted);">
  Course · ${escapeHtml(draft.target)} · generated ${date} · ephemeral ·
  <button data-theme-toggle style="background:none;border:none;color:var(--c-link);cursor:pointer;font:inherit;padding:0;border-bottom:1px solid currentColor;">light/dark</button>
</footer>

</main>
<script src="${ASSETS}/spec.js"></script>
${GATE_SCRIPT}
</body>
</html>
`;
}

function renderObjective(o: CourseObjective, i: number): string {
  const id = `T-${String(i + 1).padStart(3, '0')}`;
  const name = `quiz-${id}`;
  const opts = o.quiz.options
    .map((opt, k) => {
      const fb = o.quiz.feedback?.[k]?.trim() ?? '';
      const fbAttr = fb ? ` data-feedback="${escapeHtml(fb)}"` : '';
      return `        <li><label><input type="radio" name="${name}" value="${k}"${fbAttr}> ${escapeHtml(opt)}</label></li>`;
    })
    .join('\n');
  const correctOption = o.quiz.options[o.quiz.correctIndex] ?? '';
  const feedback = o.quiz.feedback?.[o.quiz.correctIndex]?.trim() || '';
  const teachBack = o.teachBack?.trim();
  return `<spec-task id="${id}">
  <input type="checkbox">
  <div><strong>${escapeHtml(o.title)}</strong></div>
</spec-task>

<spec-tabs>
  <spec-tab label="Read">
    <p>${o.read}</p>
  </spec-tab>
  <spec-tab label="Quiz">
    <div class="quiz" data-correct="${o.quiz.correctIndex}" data-obj="${id}">
      <p class="quiz-q">${escapeHtml(o.quiz.question)}</p>
      <ol class="quiz-opts">
${opts}
      </ol>
      <p class="quiz-verdict" hidden style="font-weight:600;margin-top:var(--s-3)"></p>
      <details class="quiz-answer">
        <summary>Reveal the answer</summary>
        <p>The correct answer is <strong>${escapeHtml(correctOption)}</strong>.${feedback ? ` ${escapeHtml(feedback)}` : ''}</p>
      </details>
    </div>
  </spec-tab>
</spec-tabs>
${
  teachBack
    ? `\n<spec-decision>
  <h4>Teach-back (ungraded)</h4>
  <p>${escapeHtml(teachBack)}</p>
  <label class="teachback">
    <span class="small-caps">Your answer — not saved (the course is ephemeral); writing it is the point.</span>
    <textarea name="teachback-${id}" rows="3" placeholder="Explain it in your own words…" style="display:block;width:100%;margin-top:var(--s-2);font:inherit;padding:var(--s-2)"></textarea>
  </label>
</spec-decision>`
    : ''
}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function describeType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}
