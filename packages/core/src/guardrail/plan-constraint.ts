import type { Finding } from '@spectastic/schema';
import { matchesGlob, normalisePath } from './glob.js';
import type { DesignDoc, GovernanceDecision } from './types.js';

export type { DesignDoc } from './types.js';

/**
 * The plan-stage constraint (spec 114-guardrail-gates, FR-001..FR-004). A pure
 * function: given the project's designs (each with the html that declares its
 * surface) and all active decisions, report an error for every design that
 * touches a path governed by an accepted decision authored in ANOTHER spec
 * without acknowledging it.
 *
 * This is where the Priya PR dies in the happy path. It is a NUDGE, not the
 * guarantee — the merge verdict (115) checks the actual diff. Profile gating is
 * the caller's job (the CLI short-circuits below standard); this function is
 * gate-agnostic and pure (no fs, no clock, no network).
 */

/** The static prefix of a glob — the leading path before the first wildcard. */
function staticPrefix(glob: string): string {
  const wc = glob.search(/[*?]/);
  const head = wc === -1 ? glob : glob.slice(0, wc);
  // Trim back to the last complete path segment.
  const slash = head.lastIndexOf('/');
  return slash === -1 ? head : head.slice(0, slash);
}

/**
 * Extract the declared surface — the path-ish tokens — from a design's
 * project-structure tree. Spike-verified over all 105 designs (114 D-003):
 * every design yields tokens; tokens are directory-coarse, which the overlap
 * test below accounts for.
 */
export function extractDeclaredSurface(html: string): string[] {
  const m = html.match(/id="(?:project-)?structure"[\s\S]*?<pre><code>([\s\S]*?)<\/code><\/pre>/);
  if (!m) return [];
  const body = m[1]!.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const tokens: string[] = [];
  for (const line of body.split('\n')) {
    const noComment = line.replace(/\s+#.*$/, '').trim();
    const first = noComment.split(/\s+/)[0];
    if (first && /[/*?]/.test(first)) tokens.push(normalisePath(first).replace(/\/$/, ''));
  }
  return [...new Set(tokens)];
}

/**
 * Does a decision's scope overlap a design's declared surface? Returns the
 * first governed path the overlap is evidenced by, or null.
 *
 * A design must declare something WITHIN the governed area — the governed
 * directory itself or a path under it — not merely an ancestor of it. The
 * ancestor direction ("declares `packages/core`, so it touches everything
 * under it") was tried and REMOVED: 114 T-900 found the repo lists coarse
 * ancestors like `packages/core` in ~97 designs, so ancestor-overlap fired the
 * gate on almost every design and made it useless. Precision over recall here —
 * the honest guarantee is 115's diff-level verdict, not this plan-time nudge.
 */
export function scopeOverlap(scopeGlobs: readonly string[], surface: readonly string[]): string | null {
  for (const glob of scopeGlobs) {
    const prefix = staticPrefix(glob);
    for (const token of surface) {
      if (matchesGlob(glob, token)) return glob; // token within the scope
      if (prefix && (token === prefix || token.startsWith(`${prefix}/`))) return glob; // token is the governed dir or under it
    }
  }
  return null;
}

/** Whether a design acknowledges a decision authored in another spec — by its
 *  coordinate tail (`<specId>/<id>`) or an anchor link (`<specId>/design.html#<id>`). */
function isAcknowledged(html: string, d: GovernanceDecision): boolean {
  return html.includes(`${d.specId}/${d.id}`) || html.includes(`${d.specId}/design.html#${d.id}`);
}

/**
 * The plan-constraint binds FORWARD-ONLY — it fires only on a Draft design (work
 * in flight at plan time), never on an Accepted one. A decision authored in a
 * later spec must not retroactively reopen specs that shipped before it existed
 * (the same forward-only binding principles use, P-6). A violation in already
 * shipped code is the merge verdict's job (115), which reads the actual diff.
 * A design with no status pill is treated as draft (in flight).
 */
function isDraftDesign(html: string): boolean {
  const m = html.match(/<spec-status\s+value="([^"]*)"/);
  return m === null || m[1] === 'draft';
}

export function planConstraintFindings(
  designs: readonly DesignDoc[],
  decisions: readonly GovernanceDecision[],
): Finding[] {
  const active = decisions.filter((d) => d.status === 'accepted' && d.paths.length > 0);
  const findings: Finding[] = [];

  for (const design of designs) {
    if (!isDraftDesign(design.html)) continue; // forward-only: only work in flight
    const surface = extractDeclaredSurface(design.html);
    if (surface.length === 0) continue;
    for (const decision of active) {
      if (decision.specId === design.specId) continue; // a plan does not acknowledge itself (FR-004)
      const governed = scopeOverlap(decision.paths, surface);
      if (governed === null) continue;
      if (isAcknowledged(design.html, decision)) continue;
      findings.push({
        file: design.file,
        line: 1,
        column: 1,
        rule: 'plan-constraint',
        severity: 'error',
        message: `this plan's surface touches "${governed}", governed by decision ${decision.specId}/${decision.id}, which it does not acknowledge`,
        fixHint: `Acknowledge the decision by referencing ${decision.specId}/${decision.id} (its coordinate tail) in this design, or narrow the project-structure tree so it does not touch that path.`,
      });
    }
  }
  return findings;
}
