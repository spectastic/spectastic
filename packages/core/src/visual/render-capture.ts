/**
 * The render verb: preflight, per-artboard capture, template guard,
 * collision refusal, write (spec 106-visual-render, T-110/T-112,
 * FR-004/FR-005/FR-006/FR-007/FR-008/FR-010, NFR-001, SC-005).
 *
 * `renderDesign` is the one export a caller (the CLI, T-114) reaches for —
 * everything else in this file is its internals. It is deliberately a
 * SEPARATE verb from `importDesignSource` (FR-004): import ports a source
 * file byte-for-byte; render drives a browser against it. Conflating them
 * would make a single verb both file-safe and network-dependent.
 *
 * Two refusal shapes, on purpose (design.html D-001):
 *   - Whole-run (THROWS, writes nothing): the destination is unsafe (FR-008,
 *     a dot-segment), or the runtime's own dependencies are unreachable
 *     (FR-005) — checked BEFORE any artboard executes, because a blocked CDN
 *     was found (by a real spike, not assumed) to yield unexpanded template
 *     labels rather than a clean failure. Both are properties of the RUN,
 *     not of any one artboard, so nothing is written when either fires.
 *   - Per-artboard (RETURNED in `result.refused`, the run continues): a
 *     label still carrying template syntax after render (the guard the
 *     spike proved necessary even when checkEgress() reports healthy), or a
 *     label that reduces to the same name as one already written this run
 *     (FR-007/SC-005 — the earlier capture wins, the later one is reported,
 *     never overwritten).
 *
 * FR-010 (this verb MUST NOT compare a capture against anything) is a
 * negative requirement with no positive code to point at — it means what
 * this file does NOT import and the shape its capture-loop does NOT take.
 * packages/core/test/render.no-comparison.test.ts pins it structurally.
 */

import { resolve } from 'node:path';
import type { FileSystem, KernelContext, RenderCapture } from '../types.js';
import { buildManifest, serializeManifest } from './render-manifest.js';
import { detectCollisions, slugLabel } from './render-naming.js';

export interface RenderDesignInput {
  /** The design source to load — a file path or URL the configured
   *  Renderer can navigate to. */
  location: string;
  /** Project-relative directory captures are written under, per the
   *  caller's own FR-008 computation (e.g. `specs/<id>/visual/renders`) —
   *  this verb does not derive a spec id itself. */
  destDir: string;
}

export interface RefusedCapture {
  label: string;
  reason: string;
}

export interface WrittenCapture {
  label: string;
  /** PROJECT-RELATIVE, never absolute. The manifest carrying this is
   *  committed beside the captures it describes, so an absolute path would
   *  be meaningless to every reader but the machine that produced it — and
   *  would leak that machine's layout into the repository. */
  path: string;
  /** Carried through, never discarded (FR-009) — the run's manifest
   *  (T-310/T-311) is this field's consumer. */
  consoleErrors: string[];
}

export interface RenderDesignResult {
  written: WrittenCapture[];
  refused: RefusedCapture[];
}

/** The one extension this verb writes — Playwright's default screenshot
 *  encoding, and the only encoding packages/render's adapter (T-113)
 *  produces. RenderCapture itself carries no format field (FR-010's
 *  "nothing to compare" extends to "nothing to be a format opinion about"),
 *  so this constant is this file's decision alone, not the port's. */
const CAPTURE_EXTENSION = 'png';

/** An artboard's own declared label leaking unexpanded template syntax —
 *  the spike behind design D-001: a blocked CDN yielded labels that still
 *  read like `{{ s.id }} · light` rather than the runtime throwing. */
const TEMPLATE_SYNTAX = /\{\{|\}\}/;

/** The artboard declaration the adapter's own selector looks for — matched
 *  here on the raw text so resolution needs no browser and no parser. */
const DECLARES_ARTBOARD = /data-screen-label\s*=/i;

/** FR-008's second clause: no path segment behind this destDir may begin
 *  with a dot — covers both a `..` traversal and a bare dotfile-style
 *  directory (a dotfile filter is exactly why 094's tool-made image went
 *  invisible rather than refused). */
function hasDotSegment(destDir: string): boolean {
  return destDir.split('/').some((segment) => segment.startsWith('.'));
}

/** A source string that already names something a browser can navigate. */
function isNavigable(location: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(location);
}

/** Pages, by extension. `.dc.html` is what a real design export ships. */
const PAGE_SUFFIXES = ['.html', '.htm', '.xhtml'] as const;

/**
 * Resolve a source (FR-012) to the page locations to navigate.
 *
 * A URL passes through — nothing local to inspect, and this verb requires
 * egress anyway (FR-005). A page passes through as a `file://` URL. A
 * directory or archive is expanded through the same fetcher seam the import
 * uses, then scanned for documents that actually declare an artboard, so the
 * caller may hand this verb the value the import takes. Scanning for the
 * declaration rather than trusting the extension is what keeps an uploaded
 * spec document — which a real export also carries — out of the render set.
 */
export async function resolveRenderLocations(location: string, fs: FileSystem, cwd: string): Promise<string[]> {
  if (isNavigable(location)) return [location];

  const { looksLikeArchive, archiveSourceFetcher } = await import('../providers/archive-source-fetcher.js');
  const { localSourceFetcher } = await import('../providers/local-source-fetcher.js');

  // An archive is a file too, so this test comes FIRST — checking "is it a
  // file?" before "is it an archive?" hands the browser a .zip to download,
  // which is the defect this resolution exists to fix.
  if (!looksLikeArchive(location)) {
    const direct = resolve(cwd, location);
    const stat = await fs.stat(direct).catch(() => null);
    if (stat?.isFile === true) return [`file://${direct}`];
  }

  const dir = looksLikeArchive(location)
    ? await archiveSourceFetcher(cwd).fetch(location)
    : await localSourceFetcher(fs, cwd).fetch(location);

  const { collectExportFiles } = await import('./import.js');
  const names = await collectExportFiles(fs, dir);
  const out: string[] = [];
  for (const name of names) {
    if (!PAGE_SUFFIXES.some((s) => name.toLowerCase().endsWith(s))) continue;
    const body = await fs.readFile(`${dir}/${name}`).catch(() => '');
    if (DECLARES_ARTBOARD.test(body)) out.push(`file://${dir}/${name}`);
  }
  return out;
}

export async function renderDesign(input: RenderDesignInput, ctx: KernelContext): Promise<RenderDesignResult> {
  const { location, destDir } = input;
  const fs = ctx.fs ?? (await import('../providers/node-fs.js')).nodeFs;
  const renderer = ctx.render;
  if (!renderer) {
    throw new Error(
      'no renderer configured on this KernelContext — render-capture requires ctx.render (packages/render supplies the Playwright adapter)',
    );
  }

  // Structural precondition on the destination every capture in this run
  // would land under — unsafe for one artboard means unsafe for all of
  // them, so this is a whole-run throw, not a per-artboard refusal.
  if (hasDotSegment(destDir)) {
    throw new Error(`refusing to write under "${destDir}" — a path segment begins with a dot`);
  }

  // FR-005, checked before executing any artboard: a blocked CDN was
  // measured (design D-001's spike) to yield broken-but-present output
  // rather than a clean failure, so this must be asked rather than inferred
  // from what render() returns.
  const reachable = await renderer.checkEgress();
  if (!reachable) {
    throw new Error(
      'the render runtime is not reachable — its dependencies could not be reached before executing any artboard',
    );
  }

  // FR-012 — the source may be a page, a URL, a directory or an archive.
  // Resolve it to the page(s) that actually declare artboards before any
  // navigation, so the caller can hand this verb the same value the import
  // takes. A source that resolves to none is refused with its reason rather
  // than navigated as-is, which is what produced `page.goto: Download is
  // starting` when a .zip reached the browser.
  const locations = await resolveRenderLocations(location, fs, ctx.cwd);
  if (locations.length === 0) {
    throw new Error(
      `"${location}" resolves to no page declaring artboards — nothing to render. Point --from at the export, a page inside it, or a URL.`,
    );
  }

  const { captures } = await renderer.render(locations);

  const refused: RefusedCapture[] = [];
  const accepted: RenderCapture[] = [];
  for (const capture of captures) {
    if (TEMPLATE_SYNTAX.test(capture.label)) {
      refused.push({
        label: capture.label,
        reason: `label still carries unexpanded template syntax ("${capture.label}") — refusing rather than writing a broken name`,
      });
      continue;
    }
    accepted.push(capture);
  }

  // FR-007/SC-005: two accepted labels reducing to one name is reported,
  // never a silent overwrite. The earlier capture in the run's own order
  // wins; every later collider is refused.
  const collisions = detectCollisions(accepted.map((capture) => capture.label));
  const dirPath = `${ctx.cwd}/${destDir}`;
  // Unconditional: the manifest is always written below, even when every
  // artboard was refused and nothing else lands here.
  await fs.mkdir(dirPath);

  const writtenSlugs = new Set<string>();
  const written: WrittenCapture[] = [];
  for (const capture of accepted) {
    const slug = slugLabel(capture.label);
    if (writtenSlugs.has(slug)) {
      const colliders = collisions.get(slug) ?? [];
      const others = colliders.filter((label) => label !== capture.label);
      refused.push({
        label: capture.label,
        reason: `label reduces to the same name ("${slug}") as ${others.join(', ') || 'an earlier capture'} in this run — refusing rather than overwriting`,
      });
      continue;
    }

    const relativePath = `${destDir}/${slug}.${CAPTURE_EXTENSION}`;
    await fs.writeBinary(`${ctx.cwd}/${relativePath}`, capture.bytes);
    writtenSlugs.add(slug);
    written.push({ label: capture.label, path: relativePath, consoleErrors: capture.consoleErrors });
  }

  // The manifest (T-310/T-311, FR-009/FR-011, design D-006): every artboard
  // found, accounted for, beside the captures it describes. Written fresh
  // every run — buildManifest holds no state, so a re-run's manifest
  // describes only the run that just happened (FR-011, T-302).
  const manifest = buildManifest(written, refused, location);
  await fs.writeFile(`${dirPath}/manifest.json`, serializeManifest(manifest));

  return { written, refused };
}
