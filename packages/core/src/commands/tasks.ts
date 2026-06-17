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
    const enrichment = await enrichDescriptions(meta, ctx);
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
): Promise<Record<string, string>> {
  if (!ctx.ai) return {};
  const reqList = [...meta.fr, ...meta.nfr, ...meta.sc]
    .map((r) => `${r.id} (${r.priority}): ${r.summary}`)
    .join('\n');
  const raw = await ctx.ai.chat(
    [
      `For each requirement below, suggest a concise (≤ 12-word) task title that implements it.`,
      `Return JSON: { "T-XYZ": "task title", ... } where keys are task IDs T-110..T-3NN.`,
      `Requirements:`,
      reqList,
    ].join('\n'),
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
