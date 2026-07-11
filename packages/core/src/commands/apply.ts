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

  // Guarantee-layer slice 1 (spec 030 / P-8): a principles amendment is applied by
  // the kernel, not by hand. The reserved `principles` spec-id resolves to root paths
  // and runs the principles-specific fold; everything else is reused (D-001, D-005).
  if (input.kind === 'apply' && input.specId === 'principles') {
    return applyPrinciples(input, ctx, fs, today, todayHuman);
  }

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

    // Requirement-vs-data branch (triage T-018 / REQ-CHANGE-002, REQ-CHANGE-008).
    // A target of requirement-ID shape (^[A-Z]+-) touches a numbered requirement in
    // spec.html; any other target (a manifest key/path like `standard/foo`) is a
    // data/content delta whose post-state is its §6 tasks — apply makes no change to
    // the requirements body for it (the changelog append below still lands).
    const targetsRequirement = /^[A-Z]+-/.test(target);
    if (!targetsRequirement) {
      deltas.push({
        target,
        op,
        result: 'success',
        reason: 'data/content delta — requirements body unchanged',
      });
      continue;
    }
    // Shape guard: an added/modified requirement delta MUST embed its post-state.
    // A missing one is the T-018 fabrication trap — gate-block, never synthesize a
    // requirement from the delta body.
    const embeddedRequirement = extractInner(body, 'spec-requirement');
    if ((op === 'added' || op === 'modified') && embeddedRequirement == null) {
      deltas.push({
        target,
        op,
        result: 'gate-blocked',
        reason: 'requirement delta missing <spec-requirement>',
      });
      continue;
    }

    if (op === 'added') {
      // Insert the embedded post-state before the next </section>.
      const insertion = `\n${wrapRequirement(target, embeddedRequirement!)}\n`;
      const closingSection = liveSpec.indexOf('</section>');
      if (closingSection === -1) {
        deltas.push({ target, op, result: 'gate-blocked', reason: 'no </section> anchor' });
        continue;
      }
      liveSpec = `${liveSpec.slice(0, closingSection)}${insertion}${liveSpec.slice(closingSection)}`;
      deltas.push({ target, op, result: 'success' });
    } else if (op === 'modified') {
      const newBody = embeddedRequirement!;
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

const PRINCIPLES_APPLY_RE = /<spec-principles-apply>([\s\S]*?)<\/spec-principles-apply>/i;

interface PrinciplesFields {
  from: string;
  to: string;
  tagline: string;
  tldr: string;
}

/**
 * Apply a principles amendment (spec 030-kernel-principles-apply). Reuses the risk gate,
 * appendChangelogEntry, deepenArchivePaths, and the mkdir-before-rename move; adds only the
 * principles-specific fold — a bare-principle insert + version/tagline/TL;DR substitution
 * from the proposal's <spec-principles-apply> block — and skips the §6 fold (FR-002). All
 * paths are root-relative (principles.html lives at repo root, not under specs/).
 */
async function applyPrinciples(
  input: ApplyInput,
  ctx: KernelContext,
  fs: NonNullable<KernelContext['fs']>,
  today: string,
  todayHuman: string,
): Promise<ApplyResult> {
  const proposalDir = `${ctx.cwd}/changes/${input.slug}`;
  const proposalPath = `${proposalDir}/proposal.html`;
  const targetPath = `${ctx.cwd}/principles.html`;
  const proposalHtml = await fs.readFile(proposalPath, 'utf8');

  if (IDENTIFIED_RISK_RE.test(proposalHtml)) {
    throw new Error(
      `applyCommand: proposal at ${proposalPath} contains <spec-risk status="identified">. Transition each to accepted/mitigated/rejected before apply.`,
    );
  }

  const fields = parsePrinciplesApply(proposalHtml);
  let live = await fs.readFile(targetPath, 'utf8');

  // Stale guard (FR-005): the live version must equal the proposal's declared from-version.
  const liveVer = /<b>Version<\/b>\s*<span>([^<]+)<\/span>/i.exec(live)?.[1]?.trim();
  if (liveVer !== fields.from) {
    throw new Error(
      `applyCommand: stale principles proposal — declares from-version ${fields.from} but principles.html is at ${liveVer ?? '(unknown)'}.`,
    );
  }

  const deltas = foldPrinciplesDeltas(proposalHtml, (updated) => {
    live = updated(live);
  });

  live = substitutePrinciplesHeader(live, fields, today, todayHuman);

  const summary =
    input.summary ??
    `${deltas.length} delta${deltas.length === 1 ? '' : 's'} (${deltas.filter((d) => d.result === 'success').length} successful)`;
  const changelogEntry = `<li><time datetime="${today}">${todayHuman}</time><span>Applied <a href="./changes/archive/${input.slug}/proposal.html">${input.slug}</a>: ${summary}.</span></li>`;
  live = appendChangelogEntry(live, changelogEntry);
  await fs.writeFile(targetPath, live);

  // Flip status + deepen paths (reused), then archive at root (mkdir-before-rename, T-007).
  const archivedProposal = deepenArchivePaths(
    appendChangelogEntry(
      proposalHtml
        .replaceAll(/<spec-status value=["'][^"']+["']>[^<]*<\/spec-status>/g, '<spec-status value="applied">Applied</spec-status>')
        .replaceAll(/(<spec-change\b[^>]*?)\sstatus=["'][^"']+["']/g, '$1 status="applied"'),
      `<li><time datetime="${today}">${todayHuman}</time><span>Applied on ${todayHuman} — ${summary}.</span></li>`,
    ),
  );
  await fs.writeFile(proposalPath, archivedProposal);

  await fs.mkdir(`${ctx.cwd}/changes/archive`);
  const archiveDir = `${ctx.cwd}/changes/archive/${input.slug}`;
  await fs.rename(proposalDir, archiveDir);

  return { liveSpec: targetPath, archivedPath: archiveDir, deltas, changelogEntry, crossSpecWarnings: [], foldedPhase: null };
}

/** Parse + validate the proposal's <spec-principles-apply> block (FR-004). Throws if absent/incomplete. */
function parsePrinciplesApply(proposalHtml: string): PrinciplesFields {
  const block = PRINCIPLES_APPLY_RE.exec(proposalHtml)?.[1];
  if (block === undefined) {
    throw new Error('applyCommand: principles proposal is missing its <spec-principles-apply> block (spec 030 FR-004).');
  }
  const from = /<version\b[^>]*\bfrom=["']([^"']+)["']/i.exec(block)?.[1];
  const to = /<version\b[^>]*>([^<]+)<\/version>/i.exec(block)?.[1]?.trim();
  const tagline = /<tagline>([\s\S]*?)<\/tagline>/i.exec(block)?.[1]?.trim();
  const tldr = /<tldr>([\s\S]*?)<\/tldr>/i.exec(block)?.[1]?.trim();
  if (from === undefined || !to || tagline === undefined || tldr === undefined) {
    throw new Error('applyCommand: <spec-principles-apply> needs <version from="…">…</version>, <tagline>, <tldr> (spec 030 FR-004).');
  }
  return { from, to, tagline, tldr };
}

/** Fold each ADD/MODIFY delta as a bare principle; `mutate` applies each transform to the live doc. */
function foldPrinciplesDeltas(proposalHtml: string, mutate: (fn: (live: string) => string) => void): DeltaApplication[] {
  const deltas: DeltaApplication[] = [];
  for (const match of proposalHtml.matchAll(DELTA_RE)) {
    const op = match[1] as DeltaApplication['op'];
    const target = match[2]!;
    const bare = setPrincipleId(extractRequirementInner(match[3] ?? ''), target);
    if (op === 'added') {
      mutate((live) => insertPrincipleAtEndOfCore(live, bare));
      deltas.push({ target, op, result: 'success' });
    } else if (op === 'modified') {
      let found = false;
      mutate((live) => {
        const replaced = replacePrinciple(live, target, bare);
        found = replaced !== null;
        return replaced ?? live;
      });
      deltas.push(found ? { target, op, result: 'success' } : { target, op, result: 'gate-blocked', reason: 'principle not found' });
    } else {
      deltas.push({ target, op, result: 'gate-blocked', reason: `op ${op} unsupported for principles` });
    }
  }
  return deltas;
}

/** The inner of a delta's <spec-requirement> (the bare <h3> + <p> body), or the raw body. */
function extractRequirementInner(body: string): string {
  const m = /<spec-requirement[^>]*>([\s\S]*?)<\/spec-requirement>/i.exec(body);
  return (m?.[1] ?? body).trim();
}

/** Ensure the principle's <h3> carries id="P-N" (principles use bare <h3 id>; the delta's h3 has none). */
function setPrincipleId(inner: string, id: string): string {
  if (/<h3\b[^>]*\bid=/i.test(inner)) {
    return inner.replace(/(<h3\b[^>]*\bid=["'])[^"']*(["'])/i, `$1${id}$2`);
  }
  return inner.replace(/<h3\b/i, `<h3 id="${id}"`);
}

/** Insert a bare principle just before the close of <section id="core-principles"> (after the last principle). */
function insertPrincipleAtEndOfCore(live: string, bare: string): string {
  const secStart = live.indexOf('<section id="core-principles">');
  if (secStart === -1) throw new Error('applyCommand: principles.html is missing <section id="core-principles">.');
  const secEnd = live.indexOf('</section>', secStart);
  return `${live.slice(0, secEnd)}\n${bare}\n${live.slice(secEnd)}`;
}

/** Replace an existing principle block (its <h3 id> up to the next <h3> or </section>). Null if absent. */
function replacePrinciple(live: string, id: string, bare: string): string | null {
  const re = new RegExp(String.raw`<h3\b[^>]*\bid=["']` + id + String.raw`["'][\s\S]*?(?=<h3\b|</section>)`, 'i');
  return re.test(live) ? live.replace(re, bare + '\n\n') : null;
}

/** Substitute the version (pill + meta + footer), amended date, tagline, and TL;DR. */
function substitutePrinciplesHeader(live: string, f: PrinciplesFields, today: string, todayHuman: string): string {
  const fromV = escapeRegExp(f.from);
  return live
    .replace(new RegExp(String.raw`(Principles · v)` + fromV), `$1${f.to}`)
    .replace(/(<b>Version<\/b>\s*<span>)[^<]+(<\/span>)/i, `$1${f.to}$2`)
    .replace(new RegExp(String.raw`(Principles v)` + fromV), `$1${f.to}`)
    .replace(/(<b>Last amended<\/b>\s*<span><time datetime=")[^"]*(">)[^<]*(<\/time>)/i, `$1${today}$2${todayHuman}$3`)
    .replace(/(<footer[^>]*>[\s\S]*?amended [^·<]*?)(\s·)/i, `$1, ${todayHuman}$2`)
    .replace(/(<p style="[^"]*font-size:1\.25rem[^"]*">)[\s\S]*?(<\/p>)/i, `$1\n    ${f.tagline}\n  $2`)
    .replace(/(<spec-tldr>)[\s\S]*?(<\/spec-tldr>)/i, `$1\n    ${f.tldr}\n  $2`);
}

/** Escape a string for literal use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
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
