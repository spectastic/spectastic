/**
 * Apply (or withdraw) a change proposal against its live spec.
 *
 * Canonical procedure: commands/spectastic.apply.md. Per spec 010 +
 * its plan: fully deterministic (no AI); uses targeted string
 * replacement on stable <spec-requirement id="…"> anchors; archive
 * folder move is atomic via fs.rename.
 *
 * Apply mode: folds the proposal's <spec-delta> blocks into the live
 * spec, appends a changelog entry, moves the proposal to changes/archive/.
 *
 * Withdraw mode: flips proposal status to "withdrawn", moves folder
 * to changes/withdrawn/, appends a "Considered, withdrew" entry on the
 * live spec.
 *
 * The risk-status gate (per REQ-CHANGE-004): the kernel refuses to
 * apply if any <spec-risk status="identified"> remains in the
 * proposal. Caller must transition each to accepted/mitigated/rejected
 * first.
 */

import type {
  ApplyInput,
  ApplyResult,
  DeltaApplication,
  KernelContext,
  WithdrawInput,
} from '../types.js';
import { deepenArchivePaths } from '../archive-paths.js';

const IDENTIFIED_RISK_RE = /<spec-risk[^>]*\bstatus=["']identified["']/i;
const DELTA_RE =
  /<spec-delta\s+op=["']([^"']+)["'][^>]*\btarget=["']([^"']+)["'][^>]*>([\s\S]*?)<\/spec-delta>/g;

export async function applyCommand(
  input: ApplyInput | WithdrawInput,
  ctx: KernelContext,
): Promise<ApplyResult> {
  const fs = ctx.fs ?? (await import('../providers/node-fs.js')).nodeFs;
  const today = new Date().toISOString().slice(0, 10);
  const todayHuman = formatHumanDate(new Date());

  const specPath = `${ctx.cwd}/specs/${input.specId}/spec.html`;
  const proposalDir = `${ctx.cwd}/specs/${input.specId}/changes/${input.slug}`;
  const proposalPath = `${proposalDir}/proposal.html`;

  const proposalHtml = await fs.readFile(proposalPath, 'utf8');

  if (input.kind === 'withdraw') {
    return doWithdraw(input, proposalHtml, proposalDir, specPath, today, todayHuman, fs, ctx);
  }

  // Apply mode: check risk gate first.
  if (IDENTIFIED_RISK_RE.test(proposalHtml)) {
    throw new Error(
      `applyCommand: proposal at ${proposalPath} contains <spec-risk status="identified">. Transition each to accepted/mitigated/rejected before apply.`,
    );
  }

  let liveSpec = await fs.readFile(specPath, 'utf8');
  const deltas: DeltaApplication[] = [];

  for (const match of proposalHtml.matchAll(DELTA_RE)) {
    const op = match[1] as DeltaApplication['op'];
    const target = match[2]!;
    const body = match[3] ?? '';

    if (op === 'added') {
      // Find the topic-group h3 matching target prefix; append.
      const requirementHtml = extractInner(body, 'spec-requirement') ?? body.trim();
      // Naive: insert before the next </section>.
      const insertion = `\n${wrapRequirement(target, requirementHtml)}\n`;
      const closingSection = liveSpec.indexOf('</section>');
      if (closingSection === -1) {
        deltas.push({ target, op, result: 'gate-blocked', reason: 'no </section> anchor' });
        continue;
      }
      liveSpec = `${liveSpec.slice(0, closingSection)}${insertion}${liveSpec.slice(closingSection)}`;
      deltas.push({ target, op, result: 'success' });
    } else if (op === 'modified') {
      const newBody = extractInner(body, 'spec-requirement') ?? body.trim();
      const re = new RegExp(`<spec-requirement[^>]*\\bid=["']${target}["'][\\s\\S]*?<\\/spec-requirement>`, 'i');
      if (re.test(liveSpec)) {
        liveSpec = liveSpec.replace(re, wrapRequirement(target, newBody));
        deltas.push({ target, op, result: 'success' });
      } else {
        deltas.push({ target, op, result: 'gate-blocked', reason: 'target not found in live spec' });
      }
    } else if (op === 'removed') {
      const re = new RegExp(`\\n?<spec-requirement[^>]*\\bid=["']${target}["'][\\s\\S]*?<\\/spec-requirement>\\n?`, 'i');
      if (re.test(liveSpec)) {
        liveSpec = liveSpec.replace(re, '\n');
        deltas.push({ target, op, result: 'success' });
      } else {
        deltas.push({ target, op, result: 'gate-blocked', reason: 'target not found' });
      }
    } else if (op === 'renamed') {
      // Extract new ID from the post-state requirement, then update + cross-refs in-spec.
      const newBody = extractInner(body, 'spec-requirement') ?? '';
      const newIdMatch = newBody.match(/\bid=["']([^"']+)["']/);
      const newId = newIdMatch?.[1] ?? target;
      const re = new RegExp(`<spec-requirement[^>]*\\bid=["']${target}["'][\\s\\S]*?<\\/spec-requirement>`, 'i');
      if (re.test(liveSpec)) {
        liveSpec = liveSpec.replace(re, wrapRequirement(newId, newBody));
        // Intra-spec reference rewrite.
        liveSpec = liveSpec.split(`#${target}`).join(`#${newId}`);
        deltas.push({ target, op, result: 'success', reason: `renamed to ${newId}` });
      } else {
        deltas.push({ target, op, result: 'gate-blocked', reason: 'target not found' });
      }
    }
  }

  // Append changelog entry — the author-supplied summary (REQ-CHANGE-008)
  // preserves the changelog's human voice; raw CLI use falls back to a terse
  // delta count.
  const summary =
    input.summary ??
    `${deltas.length} delta${deltas.length === 1 ? '' : 's'} (${deltas.filter((d) => d.result === 'success').length} successful)`;
  const changelogEntry = `<li><time datetime="${today}">${todayHuman}</time><span>Applied <a href="./changes/archive/${input.slug}/proposal.html">${input.slug}</a>: ${summary}.</span></li>`;
  liveSpec = appendChangelogEntry(liveSpec, changelogEntry);

  await fs.writeFile(specPath, liveSpec);

  // Fold the proposal's §6 tasks into the target tracker (REQ-CHANGE-007). Runs
  // on the in-memory §6 BEFORE the archive move, so a fold failure leaves the
  // proposal in changes/ for a clean retry rather than a half-applied state.
  const foldedPhase = await foldProposalTasks(proposalHtml, input, ctx, fs);

  // Flip the proposal's own status to applied and record its apply entry (the
  // markdown's old step 7), written before the archive move so the archived copy
  // carries the applied status.
  const archivedProposal = deepenArchivePaths(
    appendChangelogEntry(
      proposalHtml
        .replaceAll(/<spec-status value=["'][^"']+["']>[^<]*<\/spec-status>/g, '<spec-status value="applied">Applied</spec-status>')
        .replaceAll(/(<spec-change\b[^>]*?)\sstatus=["'][^"']+["']/g, '$1 status="applied"'),
      `<li><time datetime="${today}">${todayHuman}</time><span>Applied on ${todayHuman} — ${summary}.</span></li>`,
    ),
  );
  await fs.writeFile(proposalPath, archivedProposal);

  // Move folder to archive. Ensure the archive parent exists first — a spec's
  // first apply has no changes/archive/ yet, and fs.rename cannot move into a
  // missing parent (REQ-CHANGE-007 / triage T-007).
  await fs.mkdir(`${ctx.cwd}/specs/${input.specId}/changes/archive`);
  const archiveDir = `${ctx.cwd}/specs/${input.specId}/changes/archive/${input.slug}`;
  await fs.rename(proposalDir, archiveDir);

  return {
    liveSpec: specPath,
    archivedPath: archiveDir,
    deltas,
    changelogEntry,
    crossSpecWarnings: [],
    foldedPhase,
  };
}

/**
 * The §6 task-fold (REQ-CHANGE-007 / REQ-CHANGE-006). Deterministic: transcribe
 * each §6 `<li>` into a `<spec-task>` per REQ-LIFECYCLE-003, append a
 * provenance-linked phase to the target tracker (creating it from the template
 * if absent), with IDs continued in a fresh hundred-range above the current max.
 * Returns `null` for an empty §6 (owes no phase).
 */
async function foldProposalTasks(
  proposalHtml: string,
  input: ApplyInput,
  ctx: KernelContext,
  fs: NonNullable<KernelContext['fs']>,
): Promise<NonNullable<ApplyResult['foldedPhase']> | null> {
  const tasks = extractSixTasks(proposalHtml);
  if (tasks.length === 0) return null;

  const trackerPath = `${ctx.cwd}/specs/${input.specId}/tasks.html`;
  let tracker: string;
  let created = false;
  try {
    tracker = await fs.readFile(trackerPath, 'utf8');
  } catch {
    const template = await fs.readFile(`${ctx.cwd}/templates/tasks.html`, 'utf8');
    tracker = scaffoldTracker(template, input.specId);
    created = true;
  }

  // Fresh hundred-range above the current max, so IDs never collide.
  const base = (Math.floor(maxTaskId(tracker) / 100) + 1) * 100;
  const taskIds = tasks.map((_, i) => `T-${base + i}`);
  const taskEls = tasks
    .map(
      (t, i) =>
        `<spec-task id="${taskIds[i]}"${t.parallel ? ' parallel' : ''}>\n  <input type="checkbox">\n  <div>${t.content}</div>\n</spec-task>`,
    )
    .join('\n');

  const title = changeTitle(proposalHtml) ?? input.slug;
  const phaseId = `phase-${input.slug}`;
  const phaseRe = new RegExp(String.raw`<section id="${phaseId}"[\s\S]*?</section>\s*`, 'i');
  const phaseExisted = phaseRe.test(tracker);

  // Replace any existing phase for this slug (idempotent — completes a partial
  // prior fold rather than duplicating), then insert the complete phase.
  let out = tracker.replace(phaseRe, '');
  const phaseNum = (out.match(/class="phase"/g) ?? []).length + 1;
  const phase =
    `<section id="${phaseId}" class="phase">\n` +
    `<h2>${phaseNum} · ${title} <span class="par">(applied change ` +
    `<a href="./changes/archive/${input.slug}/proposal.html">${input.slug}</a>)</span></h2>\n` +
    `<p>Folded from the applied proposal's §6 (the archive is frozen).</p>\n${taskEls}\n</section>\n\n\n`;

  // Bump the changelog heading only when adding a new section (not replacing).
  if (!phaseExisted) {
    out = out.replace(/<h2>(\d+)(\s*·\s*Change log<\/h2>)/i, (_m, n: string, rest: string) => `<h2>${Number(n) + 1}${rest}`);
  }
  const idx = out.indexOf('<section id="changelog">');
  if (idx === -1) {
    const mainEnd = out.lastIndexOf('</main>');
    out = mainEnd === -1 ? out + phase : `${out.slice(0, mainEnd)}${phase}${out.slice(mainEnd)}`;
  } else {
    out = `${out.slice(0, idx)}${phase}${out.slice(idx)}`;
  }

  await fs.writeFile(trackerPath, out);

  // Fidelity post-condition (REQ-CHANGE-007): re-read and confirm the phase
  // faithfully carries every §6 item before reporting success. Runs before the
  // archive move, so a failure leaves the proposal in changes/ for a clean
  // retry — never half-applied.
  const written = await fs.readFile(trackerPath, 'utf8');
  const problems = verifyFoldFidelity(written, phaseId, taskIds, tasks);
  if (problems.length > 0) {
    throw new Error(`applyCommand: §6 fold for ${phaseId} is not faithful — ${problems.join('; ')}.`);
  }
  return { trackerPath, phaseId, taskIds, created };
}

interface SixTask {
  content: string;
  parallel: boolean;
  path: string | null;
}

/** Each §6 `<li>` (those carrying a checkbox), stripped of the checkbox; `[P]` → parallel; path captured. */
function extractSixTasks(proposalHtml: string): SixTask[] {
  const section = /<section id=["']tasks["']>([\s\S]*?)<\/section>/i.exec(proposalHtml)?.[1] ?? '';
  const out: SixTask[] = [];
  for (const li of section.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    let inner = li[1] ?? '';
    if (!/<input[^>]*type=["']checkbox["']/i.test(inner)) continue;
    inner = inner.replace(/<input[^>]*type=["']checkbox["'][^>]*>/i, '').trim();
    const path = /<span class=["']path["']>([\s\S]*?)<\/span>/i.exec(inner)?.[1]?.trim() ?? null;
    out.push({ content: inner, parallel: /\[P\]/.test(inner), path });
  }
  return out;
}

/**
 * The fidelity post-condition (REQ-CHANGE-007): every §6 item must have a
 * `<spec-task>` in the folded phase, carrying its path. Returns the problems
 * found (empty = faithful) — presence of a phase is not containment.
 */
function verifyFoldFidelity(tracker: string, phaseId: string, taskIds: string[], tasks: SixTask[]): string[] {
  const phase = new RegExp(String.raw`<section id="${phaseId}"[\s\S]*?</section>`, 'i').exec(tracker)?.[0];
  if (!phase) return [`phase ${phaseId} missing after write`];
  const problems: string[] = [];
  taskIds.forEach((id, i) => {
    const tag = new RegExp(String.raw`<spec-task\b[^>]*\bid="${id}"[^>]*>`, 'i').exec(phase)?.[0];
    if (!tag) {
      problems.push(`no <spec-task> for ${id}`);
      return;
    }
    const t = tasks[i];
    if (t?.path && !phase.includes(t.path)) problems.push(`${id} dropped path "${t.path}"`);
    if (t?.parallel && !/\bparallel\b/.test(tag)) problems.push(`${id} dropped parallel marker`);
  });
  return problems;
}

/** The highest `T-NNN` id already in the tracker (0 if none). */
function maxTaskId(tracker: string): number {
  let max = 0;
  for (const m of tracker.matchAll(/<spec-task[^>]*\bid=["']T-(\d+)["']/g)) {
    max = Math.max(max, Number(m[1]));
  }
  return max;
}

/** The change's title, from the `<spec-change>` `<h3>` (markup stripped). */
function changeTitle(proposalHtml: string): string | null {
  const m = /<spec-change[^>]*>[\s\S]*?<h3>([\s\S]*?)<\/h3>/i.exec(proposalHtml);
  return m ? m[1]!.replaceAll(/<[^>]+>/g, '').trim() : null;
}

/** Create a tracker from the template: deeper asset paths, no placeholder phases. */
function scaffoldTracker(template: string, specId: string): string {
  return template
    .replaceAll(/(["'])\.\.\/assets\//g, '$1../../assets/')
    .replaceAll(/<section id="phase-[^"]*" class="phase">[\s\S]*?<\/section>\s*/gi, '')
    .replaceAll('[SPEC_ID]', specId);
}

async function doWithdraw(
  input: WithdrawInput,
  proposalHtml: string,
  proposalDir: string,
  specPath: string,
  today: string,
  todayHuman: string,
  fs: NonNullable<KernelContext['fs']>,
  ctx: KernelContext,
): Promise<ApplyResult> {
  // Flip proposal status: status="…" → status="withdrawn".
  const flipped = proposalHtml
    .replace(/<spec-status value=["'][^"']+["']>[^<]*<\/spec-status>/g, '<spec-status value="withdrawn">Withdrawn</spec-status>')
    .replace(/<spec-change([^>]*)\sstatus=["'][^"']+["']/g, '<spec-change$1 status="withdrawn"');

  // Move folder to withdrawn/. Ensure the parent exists first — same first-use
  // missing-dir case as archive (REQ-CHANGE-005 / triage T-007).
  await fs.mkdir(`${ctx.cwd}/specs/${input.specId}/changes/withdrawn`);
  const withdrawnDir = `${ctx.cwd}/specs/${input.specId}/changes/withdrawn/${input.slug}`;
  await fs.writeFile(`${proposalDir}/proposal.html`, flipped);
  await fs.rename(proposalDir, withdrawnDir);

  // Append changelog entry to live spec.
  let liveSpec = await fs.readFile(specPath, 'utf8');
  const changelogEntry = `<li><time datetime="${today}">${todayHuman}</time><span>Considered <a href="./changes/withdrawn/${input.slug}/proposal.html">${input.slug}</a>, withdrew on ${todayHuman} because ${input.reason}.</span></li>`;
  liveSpec = appendChangelogEntry(liveSpec, changelogEntry);
  await fs.writeFile(specPath, liveSpec);

  return {
    liveSpec: specPath,
    archivedPath: withdrawnDir,
    deltas: [],
    changelogEntry,
    crossSpecWarnings: [],
  };
}

function appendChangelogEntry(html: string, entry: string): string {
  // Insert before </ol>\n</spec-changelog>.
  const closing = html.lastIndexOf('</ol>');
  if (closing === -1) return html + `\n<spec-changelog><ol>\n${entry}\n</ol></spec-changelog>`;
  return `${html.slice(0, closing)}  ${entry}\n${html.slice(closing)}`;
}

function extractInner(html: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = html.match(re);
  return m ? `<${tag}${m[0].slice(`<${tag}`.length)}` : null;
}

function wrapRequirement(id: string, inner: string): string {
  // If inner already starts with <spec-requirement, swap its id; otherwise wrap.
  if (/^\s*<spec-requirement\b/i.test(inner)) {
    return inner.replace(/\bid=["'][^"']*["']/, `id="${id}"`);
  }
  return `<spec-requirement id="${id}" priority="must">\n${inner}\n</spec-requirement>`;
}

function formatHumanDate(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
