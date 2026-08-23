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

import { resolve } from 'node:path';
import { archiveSourceFetcher, looksLikeArchive } from '../providers/archive-source-fetcher.js';
import { localSourceFetcher } from '../providers/local-source-fetcher.js';
import type { FileSystem, Renderer } from '../types.js';
import { materialiseContractViews } from '../contracts/materialise-view.js';
import { importDesignSource } from './import.js';
import { conventionalVisualPrefix } from './location.js';
import { materialiseVisualViews } from './materialise-view.js';
import { renderDesign } from './render-capture.js';

export interface OneStepInput {
  specId: string;
  /** The design export — a local path (project-relative) or a URL, the same
   *  value `visual:import --from` and `visual:render --from` each take. */
  from: string;
}

export type StepName = 'import' | 'render' | 'materialise';

/** One step's outcome. A discriminated union, not a boolean plus optionals,
 *  so a caller cannot forget to check which case it got — the same
 *  reasoning the spec's own Data model states for `Step outcome`. */
export type StepOutcome = { kind: 'completed' } | { kind: 'not-attempted'; reason: string };

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
 * import would (`SourceNotFoundError`, `SourceOutsideProjectError`); does
 * not land anything.
 */
export async function checkVisualsExport(from: string, ctx: { cwd: string; fs: FileSystem }): Promise<void> {
  const fetcher = looksLikeArchive(from) ? archiveSourceFetcher(ctx.cwd) : localSourceFetcher(ctx.fs, ctx.cwd);
  await fetcher.fetch(from);
}

export async function runVisualOneStep(input: OneStepInput, ctx: OneStepContext): Promise<RunReport> {
  const report: RunReport = [];

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
    const destDir = `${prefix}/renders`;
    // A bare filesystem path needs a scheme before a browser will navigate to
    // it; a URL is passed through unchanged — the same rule visual:render's
    // own wrapper applies.
    const location = /^[a-z][a-z0-9+.-]*:\/\//i.test(input.from)
      ? input.from
      : `file://${resolve(ctx.cwd, input.from)}`;
    await renderDesign({ location, destDir }, { cwd: ctx.cwd, fs: ctx.fs, render: ctx.render });
    report.push({ step: 'render', outcome: { kind: 'completed' } });
  }

  // Materialise last — it writes INTO design.html, which must already exist
  // (the design generation that ran before this orchestrator was called).
  const designPath = `${ctx.cwd}/specs/${input.specId}/design.html`;
  const html = await ctx.fs.readFile(designPath);
  const out = await materialiseVisualViews(
    await materialiseContractViews(html, ctx.fs, ctx.cwd, undefined, input.specId),
    ctx.fs,
    ctx.cwd,
  );
  if (out !== html) await ctx.fs.writeFile(designPath, out);
  report.push({ step: 'materialise', outcome: { kind: 'completed' } });

  return report;
}
