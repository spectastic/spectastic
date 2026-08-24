/**
 * The one-step visual orchestrator (110-visual-one-step, FR-001).
 *
 * Sequences the three verbs a person otherwise runs by hand — import, render,
 * materialise — over one design export, and returns a run report. Calls the
 * same core kernels those verbs already call
 * (`importDesignSource`, `renderDesign`, `materialiseVisualViews` +
 * `materialiseContractViews`) directly, per the design's own grounding: no
 * step needs re-implementing, this module only sequences what exists.
 *
 * Takes `{ fs, render? }` as ports and holds no capability of its own — the
 * render port is the ONE thing a caller must supply for the render step to
 * run at all (106 FR-004/NFR-002: this module never constructs a renderer,
 * never imports `@spectastic/render`). `render` is optional at the type
 * level because a caller may not always have one (US3, T-310/T-311 widen
 * what happens when it's absent); this file's own behaviour, landed in
 * US1, is the happy path only — every step attempted, every step
 * `completed`.
 */

import { readVisualDeclarations } from '@spectastic/schema/visual';
import { archiveSourceFetcher, looksLikeArchive } from '../providers/archive-source-fetcher.js';
import { localSourceFetcher } from '../providers/local-source-fetcher.js';
import type { FileSystem, Renderer } from '../types.js';
import { materialiseContractViews } from '../contracts/materialise-view.js';
import { importDesignSource } from './import.js';
import { conventionalVisualPrefix, RENDERS_SUBDIR } from './location.js';
import { materialiseVisualViews } from './materialise-view.js';
import { type RefusedCapture, renderDesign } from './render-capture.js';

export interface OneStepInput {
  specId: string;
  /** The design export — a local path (project-relative) or a URL, the same
   *  value `visual:import --from` and `visual:render --from` each take. */
  from: string;
}

export type StepName = 'import' | 'render' | 'materialise';

/** One step's outcome. A discriminated union, not a boolean plus optionals,
 *  so a caller cannot forget to check which case it got — the same
 *  reasoning the spec's own Data model states for `Step outcome`.
 *
 *  `completed-with-refusals` is the middle case FR-007 names: a delegate
 *  (106's renderDesign) may legitimately refuse part of its own work — a
 *  label collision, an unexpanded template — while completing the rest.
 *  Flattening that into a bare `completed` loses the only detail that makes
 *  it fixable; flattening it into `not-attempted` would claim the step
 *  didn't run when it plainly did. */
export type StepOutcome =
  | { kind: 'completed' }
  | { kind: 'completed-with-refusals'; refusals: RefusedCapture[] }
  | { kind: 'not-attempted'; reason: string };

export interface StepReport {
  step: StepName;
  outcome: StepOutcome;
}

export type RunReport = StepReport[];

export interface OneStepContext {
  cwd: string;
  fs: FileSystem;
  /** The render port. Undefined means the render step is not attempted —
   *  US1's own minimal, type-honest handling of the optional port; US3
   *  (T-310) widens WHY it might be undefined (a flag, an unreachable
   *  runtime) without changing this contract. */
  render?: Renderer;
}

/**
 * The preflight FR-003/D-003 names — export readability, checked in
 * isolation, before anything expensive. Reuses the exact fetcher
 * `importDesignSource` itself calls first (`import.ts:256`), so this and the
 * real import agree on what "resolves" means by construction rather than by
 * two implementations staying in sync. Throws the same typed errors a real
 * import would (`SourceNotFoundError`, `SourceSymlinkError`); does
 * not land anything.
 */
export async function checkVisualsExport(from: string, ctx: { cwd: string; fs: FileSystem }): Promise<void> {
  const fetcher = looksLikeArchive(from) ? archiveSourceFetcher(ctx.cwd) : localSourceFetcher(ctx.fs, ctx.cwd);
  await fetcher.fetch(from);
}

/** FR-008: a design declares no visual surface either by carrying no
 *  `<spec-visual>` at all, or by declaring one with `shape="none"` (093's
 *  own honest-negative). Anything else with a recognised, populated shape
 *  is a real surface. Scoped to THIS spec's own design — unlike
 *  `@spectastic/core`'s project-wide `declaredVisualState` (which
 *  accumulates across every design in the tree for the validate-time gate),
 *  this orchestrator only ever needs to know what the one spec it was
 *  invoked for declared. */
function hasVisualSurface(designHtml: string): boolean {
  return readVisualDeclarations(designHtml).some((d) => d.shape !== undefined && d.shape !== 'none');
}

export async function runVisualOneStep(input: OneStepInput, ctx: OneStepContext): Promise<RunReport> {
  const report: RunReport = [];

  // FR-008/T-311, checked first — before import, before render. Landing
  // material a design says it doesn't need reproduces exactly the defect
  // 093's own gate reports on the OTHER side of this same convention.
  const designPath = `${ctx.cwd}/specs/${input.specId}/design.html`;
  const designHtml = await ctx.fs.readFile(designPath);
  if (!hasVisualSurface(designHtml)) {
    const reason = 'the design declares no visual surface (FR-008)';
    report.push({ step: 'import', outcome: { kind: 'not-attempted', reason } });
    report.push({ step: 'render', outcome: { kind: 'not-attempted', reason } });
    report.push({ step: 'materialise', outcome: { kind: 'not-attempted', reason } });
    return report;
  }

  // D-002: the import identity is the spec id itself — no second flag, and
  // no value parsed back out of a manifest. `into` is the same conventional
  // prefix the render step derives below, so both land under one directory.
  const into = conventionalVisualPrefix('screens', input.specId) ?? `specs/${input.specId}/visual`;
  const fetcher = looksLikeArchive(input.from) ? archiveSourceFetcher(ctx.cwd) : localSourceFetcher(ctx.fs, ctx.cwd);
  await importDesignSource({ from: input.from, into, identity: input.specId }, fetcher, ctx.fs);
  report.push({ step: 'import', outcome: { kind: 'completed' } });

  if (ctx.render === undefined) {
    report.push({ step: 'render', outcome: { kind: 'not-attempted', reason: 'no render port supplied' } });
  } else {
    const prefix = conventionalVisualPrefix('screens', input.specId) ?? into;
    const destDir = `${prefix}/${RENDERS_SUBDIR}`;
    // Passed through exactly as given — resolving a source (106 FR-012) is
    // the render verb's own job, and a scheme added here would make every
    // value look already-navigable to it.
    const location = input.from;
    // T-300/FR-004: render-capture.ts throws a WHOLE-RUN refusal (unreachable
    // egress, an unsafe destDir) before executing any artboard — that must
    // not propagate out of this orchestrator as a rejection; import and
    // materialise still complete. T-303/FR-007: a PER-artboard refusal
    // (e.g. a label collision) is returned, not thrown, and must be carried
    // through rather than flattened into a bare `completed`.
    try {
      const result = await renderDesign({ location, destDir }, { cwd: ctx.cwd, fs: ctx.fs, render: ctx.render });
      report.push(
        result.refused.length > 0
          ? { step: 'render', outcome: { kind: 'completed-with-refusals', refusals: result.refused } }
          : { step: 'render', outcome: { kind: 'completed' } },
      );
    } catch (err) {
      report.push({ step: 'render', outcome: { kind: 'not-attempted', reason: (err as Error).message } });
    }
  }

  // Materialise last — it writes INTO design.html, which must already exist
  // (the design generation that ran before this orchestrator was called).
  const out = await materialiseVisualViews(
    await materialiseContractViews(designHtml, ctx.fs, ctx.cwd, undefined, input.specId),
    ctx.fs,
    ctx.cwd,
  );
  if (out !== designHtml) await ctx.fs.writeFile(designPath, out);
  report.push({ step: 'materialise', outcome: { kind: 'completed' } });

  return report;
}
