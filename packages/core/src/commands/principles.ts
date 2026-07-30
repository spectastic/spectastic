/**
 * Generate a fresh principles.html artifact from a project description.
 *
 * Canonical procedure: commands/spectastic.principles.md (consumed by
 * the /spectastic.principles slash command). The slash command runs
 * in-LLM inside Claude Code; this kernel function exposes the same
 * logic to standalone CLI / MCP / VS Code surfaces. Per 006 FR-008,
 * markdown remains the source of truth; this docblock points back.
 *
 * Per spec 008-core-principles: fresh-generation only. Amendments to
 * an existing principles.html flow through /spectastic.propose against
 * that file — explicitly OUT of scope for this verb.
 *
 * The kernel returns the rendered HTML string; the caller (CLI today,
 * MCP/VS Code tomorrow) decides where to write it. The CLI subcommand
 * implements the refuse-if-exists behaviour (D-002): writing to a
 * pre-existing principles.html exits with a structured error rather
 * than overwriting.
 */

import type { KernelContext, PrinciplesInput, PrinciplesResult } from '../types.js';

const DEFAULT_COUNT = 5;

interface PrincipleSpec {
  id: string;
  shortLabel: string;
  body: string;
}

export async function principlesCommand(input: PrinciplesInput, ctx: KernelContext): Promise<PrinciplesResult> {
  if (!ctx.ai) {
    throw new Error('principlesCommand requires ctx.ai (an AIProvider); got undefined');
  }
  const projectName = input.projectName?.trim() || 'this project';
  const tagline = input.tagline?.trim() || '';
  const count = input.principlesCount ?? DEFAULT_COUNT;
  const context = input.context?.trim() || '';

  const prompt = [
    `Generate exactly ${count} non-negotiable design principles for: ${projectName}.`,
    tagline ? `Tagline: ${tagline}` : '',
    context ? `Context: ${context}` : '',
    '',
    'Each principle should:',
    '- Be a single design constraint that downstream specs justify themselves by.',
    '- Be phrased as a positive assertion (what the project DOES), not a prohibition.',
    '- Have a short label (≤ 5 words; will become the heading).',
    '- Have a 2-3 sentence body explaining the constraint + the consequence.',
    '',
    'Return JSON: { "principles": [ { "shortLabel": string, "body": string } ] }.',
    'Output ONLY the JSON; no prose, no fences.',
  ]
    .filter(Boolean)
    .join('\n');

  const raw = await ctx.ai.chat(prompt, {
    temperature: 0,
    system:
      'You are a senior software architect drafting project-foundational design principles. Output is parsed by a program. Return ONLY the requested JSON.',
  });

  const principles = parsePrinciples(raw, count);
  const html = renderPrinciplesHtml(projectName, tagline, principles);

  return { html, principlesCount: principles.length };
}

function parsePrinciples(raw: string, expected: number): PrincipleSpec[] {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    throw new Error(
      `principlesCommand: AI returned non-JSON principles content (parse error: ${(err as Error).message})`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null || !('principles' in parsed)) {
    throw new Error('principlesCommand: AI response missing "principles" array');
  }
  const arr = (parsed as { principles: unknown }).principles;
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error('principlesCommand: AI returned empty principles array');
  }
  return arr.slice(0, expected).map((p, i) => {
    const obj = p as { shortLabel?: unknown; body?: unknown };
    const shortLabel = typeof obj.shortLabel === 'string' ? obj.shortLabel.trim() : `Principle ${i + 1}`;
    const body = typeof obj.body === 'string' ? obj.body.trim() : '';
    return {
      id: `P-${i + 1}`,
      shortLabel,
      body,
    };
  });
}

function renderPrinciplesHtml(projectName: string, tagline: string, principles: PrincipleSpec[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const principlesSection = principles
    .map((p) => `\n<h3 id="${p.id}">${p.id} · ${escapeHtml(p.shortLabel)}</h3>\n<p>${escapeHtml(p.body)}</p>`)
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'">
<title>${escapeHtml(projectName)} · Principles</title>
<link rel="stylesheet" href="assets/spec.css">
</head>
<body>
<main>

<header>
  <p class="small-caps">Principles · ${escapeHtml(projectName)}</p>
  <h1>${escapeHtml(projectName)} principles</h1>
  ${tagline ? `<p style="font-family:var(--font-serif);font-size:1.25rem;font-weight:300;color:var(--c-text-soft);font-style:italic;max-width:var(--measure);">${escapeHtml(tagline)}</p>` : ''}

  <spec-meta>
    <b>Status</b>      <span><spec-status value="draft">Draft</spec-status></span>
    <b>Version</b>     <span>v0.1.0</span>
    <b>Created</b>     <span><time datetime="${today}">${today}</time></span>
    <b>Read time</b>   <span data-reading-time></span>
  </spec-meta>
</header>


<section id="principles">
<h2>Core principles</h2>
<p>These are non-negotiable. Every requirement and decision in every downstream spec is justified by appeal to one of them.</p>
${principlesSection}
</section>


<section id="changelog">
<h2>Change log</h2>
<spec-changelog>
<ol>
  <li><time datetime="${today}">${today}</time><span>Initial draft. ${principles.length} principles authored via <code>spectastic principles</code>.</span></li>
</ol>
</spec-changelog>
</section>

</main>
<script src="assets/spec.js"></script>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
