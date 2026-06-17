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

  // Append changelog entry.
  const changelogEntry = `<li><time datetime="${today}">${todayHuman}</time><span>Applied <a href="./changes/archive/${input.slug}/proposal.html">${input.slug}</a>: ${deltas.length} delta${deltas.length === 1 ? '' : 's'} (${deltas.filter((d) => d.result === 'success').length} successful).</span></li>`;
  liveSpec = appendChangelogEntry(liveSpec, changelogEntry);

  await fs.writeFile(specPath, liveSpec);

  // Move folder to archive.
  const archiveDir = `${ctx.cwd}/specs/${input.specId}/changes/archive/${input.slug}`;
  await fs.rename(proposalDir, archiveDir);

  return {
    liveSpec: specPath,
    archivedPath: archiveDir,
    deltas,
    changelogEntry,
    crossSpecWarnings: [],
  };
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

  // Move folder to withdrawn/.
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
