import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FileWriteDecision } from './types.js';
import type { EnforcementCategory, Principle, Profile, ProfileManifest } from './profiles.js';

/**
 * Compose the three profile artifacts (spec 041, D-003 / D-004).
 *
 * `principles.html` is the bundled template filled with a shared base principle
 * set plus the profile's additions (deduped by name), inside a sentinel-marked
 * region so a later upgrade can splice more in (FR-007). `AGENTS.md` is a lean,
 * command-first skeleton; `CLAUDE.md` a thin pointer at it. All three are
 * emitted as content-based write decisions — no on-disk source, no model call.
 */

/** Stable sentinels around the composed principle blocks. */
export const PRINCIPLES_START = '<!-- spectastic:principles-start -->';
export const PRINCIPLES_END = '<!-- spectastic:principles-end -->';

export interface ComposeOptions {
  bundleRoot: string;
  manifest: ProfileManifest;
  profile: Profile;
  cwd: string;
  projectName: string;
  /** ISO date (YYYY-MM-DD) for datetime attrs. */
  date: string;
  /** Human date (DD Mon YYYY) for visible text. */
  displayDate: string;
  /**
   * Enforcement categories already covered by the project's toolchain (spec
   * 042, FR-006). When provided, the AGENTS.md gate section is tailored to the
   * gaps — acknowledging existing tools rather than telling the agent to add
   * one it already has. Omit for greenfield (nothing detected yet).
   */
  covered?: ReadonlySet<EnforcementCategory>;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Base + profile principles, deduped by name (base wins on a tie). */
export function combinedPrinciples(
  manifest: ProfileManifest,
  profile: Profile,
): Principle[] {
  const out: Principle[] = [];
  const seen = new Set<string>();
  for (const p of [...manifest.base.principles, ...profile.principles]) {
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    out.push(p);
  }
  return out;
}

/** Render principle blocks as sequential <h3 id="P-N">…</h3><p>…</p>, numbered from `startAt`. */
function renderPrincipleBlocks(principles: Principle[], startAt = 1): string {
  return principles
    .map((p, i) => {
      const id = `P-${startAt + i}`;
      return `<h3 id="${id}">${id} · ${escapeHtml(p.name)}</h3>\n<p>${escapeHtml(p.statement)}</p>`;
    })
    .join('\n\n');
}

/** The composed inner HTML of the core-principles section, sentinel-wrapped. */
function corePrinciplesSection(principles: Principle[]): string {
  return [
    '<h2>Core principles</h2>',
    '<p>These bind every spec, plan, and task in this project. Deviations require an amendment to this document and a version bump.</p>',
    '',
    PRINCIPLES_START,
    renderPrincipleBlocks(principles),
    PRINCIPLES_END,
  ].join('\n');
}

/** Fill the bundled principles template for a greenfield install. */
export function renderPrinciplesHtml(opts: ComposeOptions): string {
  const templatePath = join(opts.bundleRoot, 'templates', 'principles.html');
  let html = readFileSync(templatePath, 'utf8');
  const principles = combinedPrinciples(opts.manifest, opts.profile);

  // Replace the core-principles section body wholesale (its 5 template blocks).
  html = html.replace(
    /(<section id="core-principles">)[\s\S]*?(<\/section>)/,
    `$1\n${corePrinciplesSection(principles)}\n$2`,
  );

  const tagline = `A ${opts.profile.name} project — principles seeded by \`spectastic init --profile ${opts.profile.name}\`.`;
  const purpose =
    'Starter principles for this project, seeded from the chosen profile. Refine them with /spectastic.principles, then ratify.';

  const replacements: Array<[string, string]> = [
    ['[PROJECT_NAME]', escapeHtml(opts.projectName)],
    ['[ONE_LINE_PROJECT_TAGLINE]', escapeHtml(tagline)],
    ['[ONE_PARAGRAPH_PROJECT_PURPOSE — what we are building, for whom, and what binds every\n    downstream spec back to this document.]', purpose],
    ['[RATIFICATION_DATE]', opts.date],
    ['[LAST_AMENDED_DATE]', opts.date],
    ['[IN_SCOPE_ITEM_1]', 'What this project builds — fill in.'],
    ['[IN_SCOPE_ITEM_2]', 'A second in-scope area.'],
    ['[IN_SCOPE_ITEM_3]', 'A third in-scope area.'],
    ['[OUT_OF_SCOPE_ITEM_1]', 'What this project deliberately does not do.'],
    ['[OUT_OF_SCOPE_ITEM_2]', 'A second non-goal.'],
    ['[OWNER_NAMES_AND_HANDLES]', 'Project owner — fill in.'],
    ['[CONSENSUS | OWNER | LAZY_CONSENSUS — describe how decisions are made]', 'Owner decides; propose changes by PR.'],
    ['[HOW_TO_AMEND — typically PR to this file with version bump and Sync Impact Report]', 'PR to this file with a version bump and a Sync Impact Report.'],
    ['[ANY_ASSUMPTIONS the principles rest on — e.g. team size, target audience, budget,\ninfrastructure.]', `Assumes the ${opts.profile.name} profile's level of rigor fits this project.`],
  ];
  for (const [from, to] of replacements) html = html.split(from).join(to);

  // Visible dates ([DD Mon YYYY]) and any version tokens.
  html = html.split('[DD Mon YYYY]').join(opts.displayDate);
  html = html.split('[PRINCIPLES_VERSION]').join('0.1.0');

  return html;
}

/**
 * Render the lean, command-first AGENTS.md for a profile. When `covered` is
 * given (brownfield, spec 042 FR-006), append an enforcement-status block that
 * names which required categories are already covered vs. still to wire — so
 * the agent isn't told to add a tool the project already has.
 */
export function renderAgentsMd(
  manifest: ProfileManifest,
  profile: Profile,
  covered?: ReadonlySet<EnforcementCategory>,
): string {
  const lines = [...manifest.base.agents, ...profile.agents];
  const required = profile.enforce.required;
  if (covered !== undefined && required.length > 0) {
    const have = required.filter((c) => covered.has(c));
    const need = required.filter((c) => !covered.has(c));
    const block = [
      '',
      '## Enforcement floor',
      '',
      `This project's profile (${profile.name}, ${profile.enforce.gate} gate) requires an enforcement gate for: ${required.join(', ')}.`,
      ...(have.length > 0 ? [`- Already covered — do not replace: ${have.join(', ')}.`] : []),
      ...(need.length > 0 ? [`- Still to wire (add a tool + CI gate): ${need.join(', ')}.`] : []),
      'Run `spectastic enforce` to check the floor.',
    ];
    lines.push(...block);
  }
  lines.push('');
  return lines.join('\n');
}

/** Render the thin CLAUDE.md pointer. */
export function renderClaudeMd(manifest: ProfileManifest): string {
  return `${manifest.claudePointer.join('\n')}\n`;
}

/**
 * Additive upgrade (FR-007): splice any principles not already present (by name)
 * into an existing principles.html before the end sentinel, numbered after the
 * highest existing P-N. Returns null if the file has no sentinel (hand-authored
 * or pre-041) — the caller then falls back to the conflict prompt.
 */
export function spliceUpgrade(
  existingHtml: string,
  principles: Principle[],
): string | null {
  if (!existingHtml.includes(PRINCIPLES_END)) return null;

  // Highest existing P-number.
  let maxN = 0;
  for (const m of existingHtml.matchAll(/id="P-(\d+)"/g)) {
    maxN = Math.max(maxN, Number(m[1]));
  }

  // Only principles whose name isn't already present.
  const fresh = principles.filter(
    (p) => !existingHtml.includes(`· ${escapeHtml(p.name)}</h3>`),
  );
  if (fresh.length === 0) return existingHtml; // nothing to add; idempotent

  const blocks = renderPrincipleBlocks(fresh, maxN + 1);
  return existingHtml.replace(PRINCIPLES_END, `${blocks}\n${PRINCIPLES_END}`);
}

/**
 * Build the three content-based write decisions for a greenfield/normal compose.
 * Upgrade handling (splice) is layered on top by the caller (init.ts), which
 * reads the marker and may replace the principles decision's content.
 */
export function composeArtifacts(opts: ComposeOptions): FileWriteDecision[] {
  const files: Array<[string, string]> = [
    ['principles.html', renderPrinciplesHtml(opts)],
    ['AGENTS.md', renderAgentsMd(opts.manifest, opts.profile, opts.covered)],
    ['CLAUDE.md', renderClaudeMd(opts.manifest)],
  ];
  return files.map(([rel, content]) => {
    const destination = join(opts.cwd, rel);
    return {
      content,
      destination,
      preExisting: existsSync(destination),
      action: 'write' as const,
    };
  });
}
