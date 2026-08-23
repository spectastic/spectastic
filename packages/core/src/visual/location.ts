/**
 * Where visual material conventionally lives (spec 094-visual-sidecar-convention,
 * FR-001/FR-002, design D-001).
 *
 * Two locations at two scopes, sharing one name: the project's token set at
 * `visual/` in the root, and a feature's screens at `specs/<spec-id>/visual/`
 * beside the spec that owns them. The shared name is deliberate and mirrors the
 * contract convention, where a proposed and an effective contract also share a
 * name and differ only by location.
 *
 * Pure path arithmetic. No filesystem access of any kind, which is what lets a
 * second check run over every declaration without moving NFR-001's budget: the
 * resolve check already spends the one stat per declared path, and this spends
 * nothing.
 */

/** A conventional spec bundle path, e.g. `specs/094-slug/design.html`. */
const SPEC_DESIGN = /(?:^|\/)specs\/([^/]+)\/[^/]+\.html$/;

/** The directory name both scopes share. */
export const VISUAL_DIR = 'visual';

/**
 * The reserved subdirectory 106 (render) always writes its captures under,
 * inside the SAME `specs/<id>/visual/` directory 105 (import) treats as its
 * own landing zone (spec 106-visual-render, render-capture.ts's own
 * `destDir` computation; spec 110-visual-one-step derives the identical
 * path for its orchestrator). Named here, not left as a bare string
 * literal repeated at each call site, because 105's orphan-scan (105
 * import.ts) must recognise and exclude it: an export never contains a
 * `renders/` entry, so without this exclusion a second import sees
 * render's own prior output sitting in the directory it scans and reports
 * it as "no longer in the export" — rewriting the import manifest on every
 * redundant re-import. Triaged as 110/T-001 and the same defect the
 * 2026-08-23 propose deferred as `TBD-visual-sidecar-orphan-scope` before
 * this constant existed to fix it at the source.
 */
export const RENDERS_SUBDIR = 'renders';

/**
 * The spec that owns a declaring design, from its own path. `null` for a
 * document outside `specs/` — a template, a brief, a fixture.
 *
 * Cloned from `verify-view-missing`'s `SPEC_FILE` pattern, including the leading
 * `(?:^|\/)` that stops `myspecs/` matching. A design with no owning spec is not
 * an error: it means the feature-scoped check has nothing to compare against and
 * must stand down rather than guess a spec id.
 */
export function owningSpecId(file: string): string | null {
  return SPEC_DESIGN.exec(file)?.[1] ?? null;
}

/**
 * The project-relative directory a declared path of this kind must sit under.
 *
 * `null` only for screens with no owning spec — the one case where the
 * convention has nothing to say. A token set is project-scoped, so its location
 * never depends on which design happened to declare it.
 */
export function conventionalVisualPrefix(kind: 'tokens' | 'screens', specId: string | null): string | null {
  if (kind === 'tokens') return VISUAL_DIR;
  return specId === null ? null : `specs/${specId}/${VISUAL_DIR}`;
}

/**
 * Whether a project-relative path sits at or beneath a conventional prefix.
 *
 * A PREFIX test, never equality: FR-008 permits a project to subdivide either
 * directory, and the exemplar's own `visual/tokens/light.json` depends on it.
 * The `/` guard stops `visualisations/` reading as being under `visual/`.
 */
export function isUnderPrefix(path: string, prefix: string): boolean {
  const normalised = path.replace(/^\.\//, '').replace(/\/+$/, '');
  return normalised === prefix || normalised.startsWith(`${prefix}/`);
}
