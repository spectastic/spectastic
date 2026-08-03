/**
 * Kernel for `spectastic explore <intent>` (spec 022-explore, front half:
 * scaffold + quarantine). Deterministic and stub-free: given a resolved id, an
 * intent, today's date, and the `templates/explore.html` contents, it renders
 * the git-ignored ledger + builds the tracked quarantine marker. The CLI owns
 * id resolution, fs writes, and the date — keeping this kernel a pure function
 * (the verify.ts pattern, plan D-001).
 *
 * `quarantineFinding` is the validate leg (D-003): it maps a parsed marker to an
 * error-level Finding. It lives here (not in @spectastic/schema's rule registry)
 * because the marker is JSON, and rules are bound to a single HTML
 * ParsedDocument (plan §9). The CLI `validate` action walks the markers and
 * calls this.
 *
 * The run block (FR-008 / D-004) reuses the `CapturedRun` TYPE and the verify
 * `<spec-runblock>` SHAPE, but re-implements the tiny renderer rather than
 * importing it from verify.ts — importing would drag @spectastic/schema's parse5
 * into the explore bundle and break the lazy-load discipline the bench guards.
 */

import type { Finding } from '@spectastic/schema';
import { renderRunBlock } from '../runblock.js';
import type { CapturedRun, ExploreInput, ExploreResult, QuarantineMarker } from '../types.js';

export class ExploreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExploreError';
  }
}

// --- render ------------------------------------------------------------

/** Escape text for safe interpolation into HTML. */
function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Render an ISO `YYYY-MM-DD` date as the canonical `DD Mon YYYY` display form
 *  (REQ-FORMAT-005) — the `<time>` keeps the ISO value in `datetime=`, the visible
 *  text is zero-padded human. A non-ISO input is passed through unchanged. */
function dmyDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/**
 * The typed Run/Demo block, identical in shape to verify.html's (FR-008). An
 * absent field stays an EMPTY element so CSS `:empty` renders it loudly as
 * "not recorded" rather than a silent blank — the same loud-gap discipline as
 * verify (021 FR-009).
 */
export function renderExploreRunBlock(captured: CapturedRun | undefined): string {
  // Delegates since spec 083 D-001. This was a byte-identical copy of verify's
  // renderer; the two differed only in the suggested-status branch, which
  // explore never triggers because it never sets `verified`. Kept as a named
  // export so existing callers and tests are untouched.
  return renderRunBlock(captured);
}

const RUN_BLOCK_SLOT = '<!-- RUN_BLOCK -->';

/**
 * Render the ledger from `templates/explore.html`. The template lives one level
 * deep (`templates/`) and previews with `../assets/`; the ledger lands two deep
 * (`explorations/<id>/`), so rewrite `../assets/` → `../../assets/` on render —
 * the same adjustment the slash-command templates make on copy.
 */
export function renderLedger(input: ExploreInput): string {
  if (!input.template.includes(RUN_BLOCK_SLOT)) {
    throw new ExploreError(
      `templates/explore.html is missing the ${RUN_BLOCK_SLOT} slot — cannot place the run block.`,
    );
  }
  return input.template
    .replaceAll('../assets/', '../../assets/')
    .replaceAll('[EXPLORE_ID]', escapeHtml(input.id))
    .replaceAll('[INTENT]', escapeHtml(input.intent))
    .replaceAll('[CREATED_DATE_DISPLAY]', escapeHtml(dmyDisplay(input.created)))
    .replaceAll('[CREATED_DATE]', escapeHtml(input.created))
    .replace(RUN_BLOCK_SLOT, renderExploreRunBlock(input.capturedRun));
}

// --- marker ------------------------------------------------------------

/** Build the tracked quarantine marker (FR-004 / D-002). */
export function buildMarker(input: ExploreInput): QuarantineMarker {
  return {
    id: input.id,
    intent: input.intent,
    status: 'quarantined',
    created: input.created,
  };
}

// --- validate leg (D-003 / FR-005) -------------------------------------

/**
 * Map a parsed quarantine marker to an error-level Finding, or null if the
 * marker is not quarantined (e.g. already graduated/removed). Always error,
 * always fires — there is no opt-in flag (NFR-001 determinism). The CLI
 * `validate` action calls this for every `explorations/**\/quarantine.json` it
 * finds, regardless of the path args, so the merge gate cannot be sidestepped.
 */
export function quarantineFinding(marker: { id?: string; status?: string }, file: string): Finding | null {
  if (marker.status !== 'quarantined') return null;
  const id = marker.id ?? '(unknown id)';
  return {
    file,
    line: 1,
    column: 1,
    rule: 'explore-quarantined',
    severity: 'error',
    message: `Exploration ${id} is quarantined — un-graduated work must not ship.`,
    fixHint: `Graduate the exploration into a spec/plan/tasks, or delete explorations/${id}/ to clear.`,
  };
}

// --- kernel ------------------------------------------------------------

/**
 * Scaffold an exploration: render the ledger + build the marker. Pure and
 * deterministic given its input (the CLI supplies id, date, and template).
 */
export function exploreScaffold(input: ExploreInput): ExploreResult {
  if (input.intent.trim() === '') {
    throw new ExploreError('explore needs a non-empty intent — the one line this build will answer.');
  }
  return {
    id: input.id,
    ledgerHtml: renderLedger(input),
    marker: buildMarker(input),
  };
}
