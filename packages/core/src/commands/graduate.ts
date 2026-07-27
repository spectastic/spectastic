/**
 * Kernel for `explore --graduate <id>` (spec 023-explore-graduation): the back
 * half of the explore loop — classify → extract → restore → lift → archive.
 *
 * Two legs (plan D-002):
 *  - `graduateTransaction` — the PURE, deterministic, atomic core (T-310): write
 *    the extracted spec + plan, archive the exploration (deepening the ledger),
 *    and flip the marker `quarantined` → `graduated` with the classify stamp. The
 *    quarantine-lift is the LAST write (D-003), so any earlier failure leaves the
 *    id still refusable; a best-effort rollback un-archives and removes a partial
 *    `specs/<id>/` so a retry is clean (SC-003 / NFR-001).
 *  - the extract leg is AI-coupled and lives where the AI is available (the CLI
 *    or in-host session); it produces the `GraduateExtract` this kernel commits.
 *
 * The restore-task generation split to 024-explore-restore (former US2), so the
 * bundle this kernel writes is spec + plan, not spec + plan + tasks.
 */

import { deepenArchivePaths } from '../archive-paths.js';
import { fenceArtifactText } from '@spectastic/schema/fence';
import { buildCorpusPromptBlock, loadCorpus, withCorpusHint } from '@spectastic/corpus';
import type {
  CapturedRun,
  FileSystem,
  GraduateExtract,
  GraduationClass,
  GraduateTransactionInput,
  GraduateTransactionResult,
  KernelContext,
  QuarantineMarker,
} from '../types.js';

export class GraduateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraduateError';
  }
}

/** True when `path` is readable — the fs abstraction has no `exists`. */
async function exists(fs: FileSystem, path: string): Promise<boolean> {
  try {
    await fs.readFile(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Commit a graduation: write the extracted spec + plan, archive the exploration,
 * flip the marker last. Pure given its input (the caller supplies the date); the
 * fs ops are ordered so the quarantine-lift cannot precede a failure, and any
 * failure rolls back to no residue.
 */
export async function graduateTransaction(
  input: GraduateTransactionInput,
  ctx: KernelContext,
): Promise<GraduateTransactionResult> {
  const fs = ctx.fs;
  if (!fs) throw new GraduateError('graduateTransaction requires ctx.fs');

  const { specId, classification } = input;
  const specDir = `${ctx.cwd}/specs/${specId}`;
  const explDir = `${ctx.cwd}/explorations/${specId}`;
  const archiveParent = `${ctx.cwd}/explorations/archive`;
  const archiveDir = `${archiveParent}/${specId}`;

  // Precondition: never overwrite a live spec (FR-003).
  if (await exists(fs, `${specDir}/spec.html`)) {
    throw new GraduateError(`specs/${specId}/ already exists — graduation never overwrites a live spec.`);
  }
  // Precondition: the exploration must be a quarantined one.
  let marker: QuarantineMarker;
  try {
    marker = JSON.parse(await fs.readFile(`${explDir}/quarantine.json`)) as QuarantineMarker;
  } catch {
    throw new GraduateError(`explorations/${specId}/quarantine.json not found — nothing to graduate.`);
  }
  if (marker.status !== 'quarantined') {
    throw new GraduateError(`exploration ${specId} is not quarantined (status: ${marker.status}).`);
  }

  let wroteBundle = false;
  let movedToArchive = false;
  try {
    // 1. Write the extracted spec + plan bundle.
    await fs.mkdir(specDir);
    await fs.writeFile(`${specDir}/spec.html`, input.extract.specHtml);
    await fs.writeFile(`${specDir}/plan.html`, input.extract.planHtml);
    wroteBundle = true;

    // 2. Archive the exploration tree. Ensure the archive parent exists first —
    //    fs.rename cannot move into a missing parent (the apply T-007 lesson).
    await fs.mkdir(archiveParent);
    await fs.rename(explDir, archiveDir);
    movedToArchive = true;

    // 3. Deepen the archived ledger's relative paths (now one level deeper).
    const ledgerPath = `${archiveDir}/explore.html`;
    if (await exists(fs, ledgerPath)) {
      await fs.writeFile(ledgerPath, deepenArchivePaths(await fs.readFile(ledgerPath)));
    }

    // 4. Flip the marker LAST — the point of no return that un-refuses the id.
    const graduated: QuarantineMarker = {
      ...marker,
      status: 'graduated',
      classify: classification,
      graduated: input.date,
    };
    await fs.writeFile(`${archiveDir}/quarantine.json`, `${JSON.stringify(graduated, null, 2)}\n`);

    return { specId, specPath: `${specDir}/spec.html`, archivedPath: archiveDir, classification };
  } catch (err) {
    // Best-effort rollback so a failed graduation leaves no residue (SC-003):
    // un-archive the exploration, then remove the partial bundle.
    if (movedToArchive) {
      try {
        await fs.rename(archiveDir, explDir);
      } catch {
        /* leave for manual cleanup — the marker was never flipped, so the id stays refusable */
      }
    }
    if (wroteBundle) {
      try {
        await fs.rm(specDir);
      } catch {
        /* leave for manual cleanup */
      }
    }
    throw err;
  }
}

// --- extract leg (US1, AI-coupled) -------------------------------------

/** What the AI returns when reading a build into a spec (FR-003). */
interface ExtractedSpec {
  intent?: string;
  tldr?: string;
  stories?: Array<{ id: string; title: string; role: string; want: string; outcome: string; acceptance: string }>;
  frs?: Array<{ id: string; priority: string; body: string }>;
  scs?: Array<{ id: string; priority: string; body: string }>;
}

export interface GraduateExtractInput {
  /** The exploration id (reused for specs/<id>/). */
  specId: string;
  /** spike | tracer-bullet — recorded; shapes the restore framing downstream. */
  classification: GraduationClass;
  /** The `explore.html` ledger contents (intent + run record + build log). */
  ledger: string;
}

/** The run facts the build proved — the seed of `verified` plan grounding (FR-004). */
const RUN_FIELDS: Array<[keyof CapturedRun, string]> = [
  ['run', 'Build/start command'],
  ['toggle', 'Feature flag / setting'],
  ['tests', 'Test command'],
  ['demo', 'Demo path'],
];

/** Pull the CapturedRun fields out of the ledger's <spec-runblock>. */
function parseRunBlock(ledger: string): CapturedRun {
  const out: CapturedRun = {};
  for (const tag of ['run', 'toggle', 'tests', 'demo'] as const) {
    // `(?:\s[^>]*)?>` terminates the tag name at `>` or whitespace, so <spec-run>
    // matches but <spec-runblock> does not.
    const m = new RegExp(String.raw`<spec-${tag}(?:\s[^>]*)?>([\s\S]*?)</spec-${tag}>`).exec(ledger);
    const v = m?.[1]?.trim();
    if (v) out[tag] = v; // omit absent fields — exactOptionalPropertyTypes rejects explicit undefined
  }
  return out;
}

function tryParse(raw: string): ExtractedSpec | null {
  try {
    return JSON.parse(raw.trim().replace(/^```json\n?|\n?```$/g, '')) as ExtractedSpec;
  } catch {
    return null;
  }
}

function esc(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/**
 * The extract leg: read the build into a Draft spec + plan, seeding the run's
 * proven facts as `verified` rows in the PLAN's §3 evidence ledger (FR-004 — the
 * grounding ledger is a plan artifact, REQ-LIFECYCLE-006). The gaps the build
 * never answered are left for the /spec + /plan interviews to fill (D-007); this
 * kernel renders what the build demonstrated.
 */
export async function graduateExtract(
  input: GraduateExtractInput,
  ctx: KernelContext,
): Promise<GraduateExtract> {
  if (!ctx.ai) throw new GraduateError('graduateExtract requires ctx.ai (the extract leg is AI-coupled)');
  const run = parseRunBlock(input.ledger);
  // Corpus-in-prompt (054-corpus-in-prompt, D-001/D-005): '' when no knowledge/
  // corpus exists, so filter(Boolean) drops it — byte-identical to before.
  const corpusBlock = buildCorpusPromptBlock(loadCorpus(ctx.cwd));
  const prompt = [
    'Read this quarantined exploration ledger and extract a Draft spectastic spec from the build it describes.',
    `Classification: ${input.classification}.`,
    `Ledger:\n${fenceArtifactText(input.ledger.slice(0, 8000), 'Ledger')}`,
    corpusBlock ? `\n${corpusBlock}` : '',
    '',
    'Return ONLY JSON: { "intent": string, "tldr": string, "stories": [ { "id": "US1", "title": string, "role": string, "want": string, "outcome": string, "acceptance": string } ], "frs": [ { "id": "FR-001", "priority": "must"|"should"|"may", "body": string } ], "scs": [ { "id": "SC-001", "priority": "must"|"should", "body": string } ] }',
  ].filter(Boolean).join('\n');
  const raw = await ctx.ai.chat(prompt, {
    temperature: 0,
    system: 'You extract a spectastic spec from a built prototype. Output ONLY the requested JSON; no prose, no code fences.',
  });
  const parsed = tryParse(raw);
  if (!parsed) throw new GraduateError('graduateExtract: the model did not return JSON');

  return withCorpusHint(
    { specHtml: renderSpec(input.specId, parsed), planHtml: renderPlan(input.specId, run) },
    corpusBlock,
  );
}

function renderSpec(specId: string, s: ExtractedSpec): string {
  const stories = (s.stories ?? [])
    .map(
      (st) =>
        `<h3 id="${esc(st.id)}">${esc(st.id)} · ${esc(st.title)}</h3>\n<p>As a <strong>${esc(st.role)}</strong>, I want <strong>${esc(st.want)}</strong> so that <strong>${esc(st.outcome)}</strong>.</p>\n<p><em>Acceptance:</em> ${esc(st.acceptance)}</p>`,
    )
    .join('\n');
  const req = (r: { id: string; priority: string; body: string }): string =>
    `<spec-requirement id="${esc(r.id)}" priority="${esc(r.priority)}"><p>The system <spec-rule>MUST</spec-rule> ${esc(r.body)}</p></spec-requirement>`;
  const frs = (s.frs ?? []).map(req).join('\n');
  const scs = (s.scs ?? []).map(req).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'">
<title>${esc(specId)} · Specification</title>
<link rel="stylesheet" href="../../assets/spec.css"><script src="../../assets/theme-boot.js"></script></head>
<body><main>
<header><p class="small-caps">Specification · ${esc(specId)}</p><h1>${esc(s.intent ?? specId)}</h1>
<spec-meta><b>Status</b><span><spec-status value="draft">Draft</spec-status></span>
<b>Spec ID</b><span>${esc(specId)}</span></spec-meta>
<spec-tldr><p>${esc(s.tldr ?? 'Extracted from a graduated exploration.')}</p></spec-tldr></header>
<section id="scenarios"><h2>1 · User scenarios</h2>
${stories}</section>
<section id="requirements"><h2>2 · Requirements</h2><h3>Functional</h3>
${frs}</section>
<section id="success"><h2>3 · Success criteria</h2>
${scs}</section>
<section id="conformance"><h2>4 · Conformance index</h2><spec-conformance></spec-conformance></section>
<section id="changelog"><h2>5 · Change log</h2><spec-changelog><ol>
<li><time datetime="">today</time><span>Extracted from a graduated exploration (spec 023-explore-graduation).</span></li>
</ol></spec-changelog></section>
</main><script src="../../assets/spec.js"></script></body></html>`;
}

function renderPlan(specId: string, run: CapturedRun): string {
  // FR-004: each proven run fact becomes a `verified` row in §3, citing the
  // frozen archived exploration. Absent facts are not invented.
  const rows = RUN_FIELDS.filter(([k]) => run[k])
    .map(
      ([k, label]) =>
        `<tr><td>${esc(label)} (proven by the run)</td><td><code>explorations/archive/${esc(specId)}/explore.html</code></td><td><spec-status value="accepted">verified</spec-status></td><td>${esc(String(run[k]))}</td></tr>`,
    )
    .join('\n');
  const ledgerNote = rows
    ? `<table class="evidence"><thead><tr><th>Claim</th><th>Source</th><th>Status</th><th>Finding</th></tr></thead><tbody>\n${rows}\n</tbody></table>`
    : '<p>The build never ran — no <code>verified</code> facts to seed; the plan interview grounds the rest.</p>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'">
<title>${esc(specId)} · Plan</title>
<link rel="stylesheet" href="../../assets/spec.css"><script src="../../assets/theme-boot.js"></script></head>
<body><main>
<header><p class="small-caps">Implementation plan · ${esc(specId)}</p><h1>${esc(specId)} — plan</h1>
<spec-meta><b>Status</b><span><spec-status value="draft">Draft</spec-status></span>
<b>Spec</b><span><a href="./spec.html">${esc(specId)}</a></span></spec-meta></header>
<section id="grounding"><h2>3 · Grounding &amp; evidence</h2>
<p>Seeded from the graduated exploration's run record — the facts the build proved enter as <code>verified</code> (REQ-LIFECYCLE-006).</p>
${ledgerNote}</section>
<section id="decisions"><h2>6 · Decisions</h2>
<spec-decision id="D-001" grounding="verified"><h4>D-001 · Extracted from a running build</h4>
<dl><dt>Status</dt><dd><spec-status value="accepted">Accepted</spec-status></dd>
<dt>Context</dt><dd>Graduated from a quarantined exploration; the run record (<code>explorations/archive/${esc(specId)}/</code>) grounds the demonstrated behaviour.</dd>
<dt>Decision</dt><dd>Carry the build's proven behaviour forward; interview the gaps via /spec + /plan.</dd>
<dt>Consequences</dt><dd>+ Verified grounding from a real run. − Un-run paths remain <code>assumed</code> until the interview.</dd></dl></spec-decision></section>
<section id="changelog"><h2>9 · Change log</h2><spec-changelog><ol>
<li><time datetime="">today</time><span>Extracted from a graduated exploration.</span></li>
</ol></spec-changelog></section>
</main><script src="../../assets/spec.js"></script></body></html>`;
}
