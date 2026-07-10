/**
 * Generate a tasks.html from a spec + plan pair.
 *
 * Canonical procedure: commands/spectastic.tasks.md. Per spec 009 +
 * its plan (7 ADRs): kernel reads spec.html + plan.html via ctx.fs;
 * parses via @spectastic/schema's extractSpecMetadata; computes the
 * deterministic 5-phase structure; lightly uses ai.chat() to generate
 * task description prose; returns TasksResult. Caller writes to disk.
 *
 * Per FR-008: every FR/NFR/SC in the source spec must be referenced
 * by ≥1 task; if any is unreferenced, the kernel emits a
 * <spec-warning> in the output rather than silently dropping it.
 */

import { extractSpecMetadata } from '@spectastic/schema';
import type {
  GraduationClass,
  KernelContext,
  TaskItem,
  TaskPhase,
  TasksInput,
  TasksResult,
} from '../types.js';

export async function tasksCommand(
  input: TasksInput,
  ctx: KernelContext,
): Promise<TasksResult> {
  if (!ctx.ai) {
    throw new Error('tasksCommand requires ctx.ai (an AIProvider); got undefined');
  }
  const fs = ctx.fs ?? (await import('../providers/node-fs.js')).nodeFs;

  const specHtml = await fs.readFile(input.specPath, 'utf8');
  const planHtml = await fs.readFile(input.planPath, 'utf8');
  const meta = extractSpecMetadata(specHtml);

  if (meta.fr.length === 0) {
    throw new Error(
      `tasksCommand: source spec at ${input.specPath} declares no FR-NNN requirements; nothing to generate tasks for.`,
    );
  }

  // Restore mode (spec 024-explore-restore): generate path-appropriate restore
  // tasks for a graduated bundle instead of a normal breakdown.
  if (input.restore) {
    return restoreTasks(meta, input.restore, ctx);
  }

  const phases = await deriveAndDescribePhases(meta, planHtml, ctx);
  const referencedIds = collectReferenced(phases);
  const unreferenced = [...meta.fr, ...meta.nfr, ...meta.sc]
    .map((r) => r.id)
    .filter((id) => !referencedIds.has(id));

  const html = renderTasksHtml(meta.specId ?? 'unknown', phases, unreferenced);
  const totalTasks = phases.reduce((sum, p) => sum + p.tasks.length, 0);
  const parallelTasks = phases.reduce(
    (sum, p) => sum + p.tasks.filter((t) => t.parallel).length,
    0,
  );

  return { html, phases, totalTasks, parallelTasks };
}

async function deriveAndDescribePhases(
  meta: ReturnType<typeof extractSpecMetadata>,
  planHtml: string,
  ctx: KernelContext,
): Promise<TaskPhase[]> {
  // Deterministic phase skeleton from FRs. Heuristic: first 3 FRs → US1,
  // next 3 → US2, rest → US3; NFRs + SCs map to polish; setup +
  // foundational are derived from plan ADRs (D-NNN count = ~3 setup tasks).
  const adrCount = (planHtml.match(/<spec-decision id="D-\d+"/g) ?? []).length;
  const setupCount = Math.max(2, Math.min(adrCount, 4));

  const phases: TaskPhase[] = [
    {
      id: 'setup',
      title: 'Setup',
      tasks: range(1, setupCount).map((i) => ({
        id: `T-00${i}`,
        title: `Setup task ${i} (configure per plan ADR D-00${i})`,
        parallel: true,
      })),
    },
    {
      id: 'foundation',
      title: 'Foundational',
      tasks: [
        {
          id: 'T-010',
          title: 'Shared types + base infrastructure per plan ADRs',
          parallel: false,
        },
      ],
    },
  ];

  const us1Reqs = meta.fr.slice(0, 3);
  const us2Reqs = meta.fr.slice(3, 6);
  const us3Reqs = meta.fr.slice(6);

  if (us1Reqs.length > 0) phases.push(buildUsPhase('us1', 'US1', us1Reqs));
  if (us2Reqs.length > 0) phases.push(buildUsPhase('us2', 'US2', us2Reqs));
  if (us3Reqs.length > 0) phases.push(buildUsPhase('us3', 'US3', us3Reqs));

  if (meta.nfr.length > 0 || meta.sc.length > 0) {
    phases.push({
      id: 'polish',
      title: 'Polish',
      tasks: [
        { id: 'T-900', title: 'Bench + perf verification per NFRs', parallel: true },
        { id: 'T-901', title: 'CHANGELOG entry + version bump + tag + publish', parallel: false },
      ],
    });
  }

  // Optional: enrich titles via ai.chat() in a single batched call. Kept
  // light (skipping AI when there's no spec.ai) so unit tests stay fast.
  try {
    const enrichment = await enrichDescriptions(meta, ctx, input.decisions);
    for (const phase of phases) {
      for (const task of phase.tasks) {
        const enriched = enrichment[task.id];
        if (enriched) task.title = enriched;
      }
    }
  } catch {
    // If enrichment fails, keep the deterministic titles.
  }

  return phases;
}

function buildUsPhase(
  id: TaskPhase['id'],
  label: string,
  reqs: ReadonlyArray<{ id: string }>,
): TaskPhase {
  const startNum = id === 'us1' ? 100 : id === 'us2' ? 200 : 300;
  const tasks: TaskItem[] = [];
  tasks.push({
    id: `T-${startNum}`,
    title: `${label} tests (write &amp; fail first) for ${reqs.map((r) => r.id).join(', ')}`,
    parallel: false,
  });
  reqs.forEach((r, i) => {
    tasks.push({
      id: `T-${startNum + 10 + i}`,
      title: `Implement ${r.id}`,
      parallel: false,
    });
  });
  return { id, title: label, tasks };
}

async function enrichDescriptions(
  meta: ReturnType<typeof extractSpecMetadata>,
  ctx: KernelContext,
  decisions?: Record<string, string>,
): Promise<Record<string, string>> {
  if (!ctx.ai) return {};
  const reqList = [...meta.fr, ...meta.nfr, ...meta.sc]
    .map((r) => `${r.id} (${r.priority}): ${r.summary}`)
    .join('\n');
  const decisionPairs = Object.entries(decisions ?? {}).map(([k, v]) => `${k}: ${v}`).join('; ');
  const decisionsLine = decisionPairs ? `Chosen approach (honour it): ${decisionPairs}` : '';
  const raw = await ctx.ai.chat(
    [
      `For each requirement below, suggest a concise (≤ 12-word) task title that implements it.`,
      decisionsLine,
      `Return JSON: { "T-XYZ": "task title", ... } where keys are task IDs T-110..T-3NN.`,
      `Requirements:`,
      reqList,
    ].filter(Boolean).join('\n'),
    {
      temperature: 0,
      system:
        'You are a deterministic engineering planner. Return ONLY JSON; no prose, no fences.',
    },
  );
  try {
    const stripped = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    const parsed = JSON.parse(stripped) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function collectReferenced(phases: TaskPhase[]): Set<string> {
  const set = new Set<string>();
  for (const phase of phases) {
    for (const task of phase.tasks) {
      const matches = task.title.match(/\b(FR|NFR|SC)-\d+\b/g) ?? [];
      for (const m of matches) set.add(m);
    }
  }
  return set;
}

function renderTasksHtml(
  specId: string,
  phases: TaskPhase[],
  unreferenced: string[],
): string {
  const today = new Date().toISOString().slice(0, 10);
  const phaseSections = phases
    .map((phase, idx) => {
      const taskRows = phase.tasks
        .map(
          (t) =>
            `<spec-task id="${t.id}"${t.parallel ? ' parallel' : ''}><input type="checkbox"><div><strong>${t.title}</strong></div></spec-task>`,
        )
        .join('\n');
      return `<section id="phase-${phase.id}" class="phase"><h2>${idx + 2} · ${phase.title}</h2>\n${taskRows}\n</section>`;
    })
    .join('\n\n');
  const warning =
    unreferenced.length > 0
      ? `<spec-warning><p>Unreferenced requirements: ${unreferenced.join(', ')}. Add tasks covering them before status flips Accepted.</p></spec-warning>`
      : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${specId} · Tasks</title>
<link rel="stylesheet" href="../../assets/spec.css">
</head>
<body>
<main>
<header>
<p class="small-caps">Tasks · ${specId}</p>
<h1>${specId} — task breakdown</h1>
<spec-meta>
<b>Status</b><span><spec-status value="draft">Draft</spec-status></span>
<b>Spec</b><span><a href="./spec.html">${specId}</a></span>
<b>Plan</b><span><a href="./plan.html">plan</a></span>
<b>Created</b><span><time datetime="${today}">${today}</time></span>
</spec-meta>
${warning}
</header>

<section id="strategy"><h2>1 · Execution strategy</h2><p>MVP-first recommended. Drive through with <code>/spectastic.implement</code>.</p></section>

${phaseSections}

<section id="changelog"><h2>${phases.length + 2} · Change log</h2><spec-changelog><ol><li><time datetime="${today}">${today}</time><span>Initial task breakdown generated by <code>spectastic tasks ${specId}</code>.</span></li></ol></spec-changelog></section>
</main>
<script src="../../assets/spec.js"></script>
</body>
</html>
`;
}

function range(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => i + start);
}

// --- restore mode (spec 024-explore-restore) ---------------------------

/**
 * Generate path-appropriate restore tasks for a graduated bundle. The deterministic
 * skeleton (test-first, per-FR work, the gate-restoration / prototype-deletion
 * tail) guarantees SC-002 (test-first + banner) and SC-003 (the spike deletion
 * task) regardless of the AI; a classification-seeded enrichment pass (FR-002 /
 * FR-003 / FR-006) sharpens the per-FR titles down the refactor-to-comply or
 * clean-rebuild path.
 */
async function restoreTasks(
  meta: ReturnType<typeof extractSpecMetadata>,
  restore: NonNullable<TasksInput['restore']>,
  ctx: KernelContext,
): Promise<TasksResult> {
  const { classification, sourceArchive } = restore;
  const phases = deriveRestorePhases(meta, classification, sourceArchive);

  // Enrichment seeded by classification (the prompt names the path). Best-effort:
  // the deterministic titles survive a failed or empty enrichment. Only the per-FR
  // impl tasks are enriched — the leading test task lists several FRs and must keep
  // its "Write failing tests" framing.
  try {
    const enriched = await enrichRestore(meta, classification, sourceArchive, ctx);
    const implTasks = phases.find((p) => p.id === 'us1')?.tasks.slice(1) ?? [];
    for (const task of implTasks) {
      const frId = /\bFR-\d+\b/.exec(task.title)?.[0];
      if (frId && enriched[frId]) task.title = `${enriched[frId]} (${frId})`;
    }
  } catch {
    /* keep deterministic titles */
  }

  const referenced = collectReferenced(phases);
  const unreferenced = [...meta.fr, ...meta.nfr, ...meta.sc]
    .map((r) => r.id)
    .filter((id) => !referenced.has(id));
  const specId = meta.specId ?? 'unknown';
  const html = renderRestoreHtml(specId, classification, sourceArchive, phases, unreferenced);
  const totalTasks = phases.reduce((s, p) => s + p.tasks.length, 0);
  const parallelTasks = phases.reduce((s, p) => s + p.tasks.filter((t) => t.parallel).length, 0);
  return { html, phases, totalTasks, parallelTasks };
}

function deriveRestorePhases(
  meta: ReturnType<typeof extractSpecMetadata>,
  classification: GraduationClass,
  sourceArchive: string,
): TaskPhase[] {
  const isTracer = classification === 'tracer-bullet';
  const frIds = meta.fr.map((r) => r.id);
  const scIds = meta.sc.map((r) => r.id);
  const verb = isTracer ? 'Refactor the kept build to comply with' : 'Build (clean rebuild) to satisfy';

  // Test-first (FR-006): one failing-tests task leads, naming the SCs it verifies.
  const story: TaskItem[] = [
    {
      id: 'T-100',
      title: `Write failing tests ${isTracer ? 'against the kept build' : 'against the new spec'} for ${[...frIds, ...scIds].join(', ')}`,
      parallel: false,
      path: 'tests/',
    },
  ];
  meta.fr.forEach((r, i) => {
    story.push({ id: `T-${110 + i}`, title: `${verb} ${r.id}`, parallel: false, path: 'src/' });
  });

  const polish: TaskItem[] = [];
  if (isTracer) {
    polish.push(
      { id: 'T-900', title: 'Restore requirement IDs + the INVEST self-check', parallel: true },
      { id: 'T-901', title: 'Restore full principles compliance', parallel: true },
      { id: 'T-902', title: 'Restore the estimability + grounding gates', parallel: false },
    );
  } else {
    // SC-003: the spike path ALWAYS emits a prototype-deletion task — deterministic,
    // never dependent on the AI; the build is marked for deletion, not auto-removed.
    polish.push({ id: 'T-900', title: 'Delete the discarded prototype', parallel: false, path: sourceArchive });
  }
  if (meta.nfr.length > 0) {
    polish.push({
      id: 'T-910',
      title: `Verify the non-functional requirements (${meta.nfr.map((r) => r.id).join(', ')})`,
      parallel: true,
    });
  }

  return [
    { id: 'us1', title: isTracer ? 'Refactor to comply' : 'Clean rebuild', tasks: story },
    { id: 'polish', title: isTracer ? 'Restore the relaxed gates' : 'Retire the prototype', tasks: polish },
  ];
}

async function enrichRestore(
  meta: ReturnType<typeof extractSpecMetadata>,
  classification: GraduationClass,
  sourceArchive: string,
  ctx: KernelContext,
): Promise<Record<string, string>> {
  if (!ctx.ai) return {};
  const path = classification === 'tracer-bullet' ? 'refactor-to-comply' : 'clean-rebuild';
  const framing =
    classification === 'tracer-bullet'
      ? `The build at ${sourceArchive} is KEPT — each task refactors it to comply with the requirement and restores the gates relaxed during explore (requirement IDs, INVEST, full principles, the estimability + grounding gates).`
      : `The prototype at ${sourceArchive} is DISCARDED — each task rebuilds clean against the new spec, test-first, and the prototype is deleted at the end.`;
  const reqList = meta.fr.map((r) => `${r.id} (${r.priority}): ${r.summary}`).join('\n');
  const raw = await ctx.ai.chat(
    [
      `This is a ${classification} restore — a ${path} task list.`,
      framing,
      `For each requirement below, suggest a concise (≤ 14-word) ${path} task title. Do not include the requirement id in the title.`,
      `Return JSON: { "FR-NNN": "task title", ... }.`,
      `Requirements:\n${reqList}`,
    ].join('\n'),
    {
      temperature: 0,
      system: 'You are a deterministic engineering planner. Return ONLY JSON; no prose, no fences.',
    },
  );
  try {
    const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(stripped) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function renderRestoreHtml(
  specId: string,
  classification: GraduationClass,
  sourceArchive: string,
  phases: TaskPhase[],
  unreferenced: string[],
): string {
  const today = new Date().toISOString().slice(0, 10);
  const isTracer = classification === 'tracer-bullet';
  const phaseSections = phases
    .map((phase, idx) => {
      const taskRows = phase.tasks
        .map(
          (t) =>
            `<spec-task id="${t.id}"${t.parallel ? ' parallel' : ''}><input type="checkbox"><div><strong>${escapeHtml(t.title)}</strong>${t.path ? ` <span class="path">${escapeHtml(t.path)}</span>` : ''}</div></spec-task>`,
        )
        .join('\n');
      return `<section id="phase-${phase.id}" class="phase"><h2>${idx + 2} · ${escapeHtml(phase.title)}</h2>\n${taskRows}\n</section>`;
    })
    .join('\n\n');
  // FR-005: a visible banner naming the classification + source archive, so a
  // reader sees why the tasks are restore-shaped.
  const stance = isTracer
    ? 'Tracer-bullet: the build is kept and refactored to comply.'
    : 'Spike: the prototype is discarded and rebuilt clean, then deleted.';
  const banner = `<spec-note><p><strong>Restore tasks · ${escapeHtml(classification)}</strong> — generated for the graduated bundle from <code>${escapeHtml(sourceArchive)}</code>. ${stance} The gates relaxed during explore are restored here.</p></spec-note>`;
  const warning =
    unreferenced.length > 0
      ? `<spec-warning><p>Unreferenced requirements: ${unreferenced.join(', ')}. Add tasks covering them before status flips Accepted.</p></spec-warning>`
      : '';
  const strategy = isTracer
    ? 'Refactor-to-comply: the kept build hardens in place. Tests first, then bring each requirement to comply, then restore the relaxed gates.'
    : 'Clean rebuild: test-first against the new spec, then delete the discarded prototype.';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${specId} · Restore tasks</title>
<link rel="stylesheet" href="../../assets/spec.css">
</head>
<body>
<main>
<header>
<p class="small-caps">Tasks · ${specId}</p>
<h1>${specId} — restore task breakdown</h1>
<spec-meta>
<b>Status</b><span><spec-status value="draft">Draft</spec-status></span>
<b>Spec</b><span><a href="./spec.html">${specId}</a></span>
<b>Plan</b><span><a href="./plan.html">plan</a></span>
<b>Created</b><span><time datetime="${today}">${today}</time></span>
</spec-meta>
${banner}
${warning}
</header>

<section id="strategy"><h2>1 · Execution strategy</h2><p>${strategy} Drive through with <code>/spectastic.implement</code>.</p></section>

${phaseSections}

<section id="changelog"><h2>${phases.length + 2} · Change log</h2><spec-changelog><ol><li><time datetime="${today}">${today}</time><span>Initial ${escapeHtml(classification)} restore breakdown generated by <code>spectastic tasks ${specId} --restore</code>.</span></li></ol></spec-changelog></section>
</main>
<script src="../../assets/spec.js"></script>
</body>
</html>
`;
}
