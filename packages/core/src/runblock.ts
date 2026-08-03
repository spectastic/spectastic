/**
 * The typed Run/Demo block — the single renderer (spec 083, D-001).
 *
 * This block used to be rendered twice: once in `commands/verify.ts` and once
 * in `commands/explore.ts`, the second describing itself as "identical in shape
 * to verify.html's". They were, byte for byte, because explore never set the
 * `verified` flag that is the only thing the two branched on. Adding a field to
 * one copy is exactly the drift a copy invites, and spec 083 is the occasion it
 * would have happened on — so both verbs now call this.
 *
 * The loud-gap discipline lives here and in `assets/spec.css` together: an
 * absent field renders as a genuinely EMPTY element so the stylesheet's
 * `:empty::after` can label it "not recorded". Emitting whitespace instead
 * would silently defeat that, which is why `field()` returns '' rather than a
 * placeholder.
 */

import type { CapturedRun } from './types.js';

/** Escape text for safe interpolation into HTML. */
export function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

/**
 * Render the block from a captured run.
 *
 * Field order is the order a reader acts in — build it, turn it on, invoke it,
 * test it, see it (D-002). `exercise` sits between `toggle` and `tests` for
 * that reason, not for symmetry.
 *
 * Every value is escaped and inert, including `exercise`, which will often hold
 * a URL once a web application records its entry point (083 NFR-002 / P-11).
 * A captured value is quoted evidence, never something to navigate to.
 */
export function renderRunBlock(captured: CapturedRun | undefined): string {
  const c = captured ?? {};
  // An absent field stays an EMPTY element (no whitespace) so CSS :empty
  // renders it loudly; cites come from the captured ids.
  const field = (val?: string): string => (val ? escapeHtml(val) : '');
  const cites = (ids?: string[]): string => (ids && ids.length > 0 ? ` cites="${escapeHtml(ids.join(' '))}"` : '');
  // Spec 021 T-003: a block whose commands were NOT run is marked suggested so
  // it never presents unverified commands with the authority of verified ones
  // (P-7). Default is verified (a /implement capture ran them); only an explicit
  // verified:false downgrades the block.
  const suggested = c.verified === false;
  const status = suggested ? ' data-status="suggested"' : '';
  const banner = suggested
    ? '\n  <spec-note><strong>Suggested — not yet run.</strong> These commands were authored, not executed; verify them before trusting the result (<a href="../../principles.html#P-7">P-7</a>).</spec-note>'
    : '';
  return `<spec-runblock${status}>${banner}
  <spec-run>${field(c.run)}</spec-run>
  <spec-toggle>${field(c.toggle)}</spec-toggle>
  <spec-exercise>${field(c.exercise)}</spec-exercise>
  <spec-tests${cites(c.testsCite)}>${field(c.tests)}</spec-tests>
  <spec-demo${cites(c.demoCite)}>${field(c.demo)}</spec-demo>
</spec-runblock>`;
}
