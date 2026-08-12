/**
 * Every design's `<spec-visual>` declarations, composed (spec
 * 093-design-visual-section, FR-004/FR-005/FR-006).
 *
 * A deliberate clone of `declaredInterfaceState`, including the shape of the
 * bug that one was fixed for: declarations ACCUMULATE rather than shadow. A
 * later feature declaring `shape="none"` must not become a project-wide
 * disclaimer that voids an earlier design's declaration — that is the failure
 * the contract reader already paid for, and there is no reason to pay for it
 * twice.
 *
 * Attribute-level reads rather than a full parse, for the same two reasons the
 * contract detector gives: this is filesystem-facing code that must not take a
 * parser dependency, and a malformed design must degrade to "declares nothing"
 * rather than throw. The pure per-document parse lives in
 * `@spectastic/schema/visual`, which the rule engine imports instead.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { detectUserInterface } from '../enforce/detect.js';

/** One declared path, with the spec that declared it. */
export interface DeclaredVisualPath {
  /** Project-relative, exactly as authored — never normalised here. */
  path: string;
  /** Which attribute it came from, so a finding can say what is missing. */
  kind: 'tokens' | 'screens';
  specId: string;
  /** False for a Draft or unreadable-status design, mirroring the contract
   *  reader: declaring the surface a spec is about to create is advisory. */
  ratified: boolean;
}

export interface VisualDeclarationState {
  /** The union of declared paths across every contributing design. */
  declaredPaths: DeclaredVisualPath[];
  /** True when at least one design was read and none declares a surface. */
  declaresNoSurface: boolean;
  /** Spec ids whose design carries a populated declaration — what the gating
   *  scan reads to report a section a project should not be carrying. */
  populatedSpecs: string[];
  /** Every `source=` value seen, as provenance for a reader. Never resolved,
   *  never fetched, never checked (FR-006). */
  sources: string[];
}

/**
 * The template's own placeholder convention — `[SHAPE]`, `[TOKEN_SET_PATH]`.
 * A declaration made entirely of these is the scaffold nobody deleted; it
 * declares nothing, and must read as nothing.
 *
 * Treating it as a declaration would break the gate in both directions: a
 * placeholder shape is not `none`, so it would read as a declared SURFACE and
 * suppress the very finding that exists to catch it; and a declaration with no
 * usable shape would otherwise read as a declared NONE, silencing detection on
 * a project that plainly has an interface.
 */
function isPlaceholder(value: string): boolean {
  return /^\[.*\]$/.test(value.trim());
}

/** An attribute value, with the template's placeholders read as absent. */
function authored(value: string | undefined): string | undefined {
  return value === undefined || isPlaceholder(value) ? undefined : value;
}

/** Lifecycle states whose designs contribute nothing — superseding retires what it declared. */
const RETIRED_STATES = new Set(['superseded', 'deprecated']);

/** Read a design's own `<spec-status>` pill, lowercased; `null` when absent or unreadable. */
function designStatus(html: string): string | null {
  return /<spec-status\b[^>]*\bvalue=["']([^"']*)["']/i.exec(html)?.[1]?.toLowerCase() ?? null;
}

/**
 * One design's contribution. `null` when it contributes nothing — either it
 * carries no declaration at all, or its spec is Superseded/Deprecated and its
 * declarations are retired.
 */
function readDesignVisuals(
  html: string,
  specId: string,
): { paths: DeclaredVisualPath[]; sawSurface: boolean; sources: string[] } | null {
  const declarations = [...html.matchAll(/<spec-visual\b([^>]*)>/gi)];
  if (declarations.length === 0) return null;

  const status = designStatus(html);
  if (status !== null && RETIRED_STATES.has(status)) return null;
  // Unreadable status ⇒ Draft. The conservative direction: it can only
  // downgrade a hard finding to advisory, never invent one.
  const ratified = status === 'accepted';

  const paths: DeclaredVisualPath[] = [];
  const sources: string[] = [];
  let sawSurface = false;
  let authoredAny = false;
  for (const [, attrs = ''] of declarations) {
    const shape = authored(/\bshape=["']([^"']*)["']/i.exec(attrs)?.[1])?.toLowerCase();
    const tokens = authored(/\btokens=["']([^"']+)["']/i.exec(attrs)?.[1]);
    const screens = authored(/\bscreens=["']([^"']+)["']/i.exec(attrs)?.[1]);
    const source = authored(/\bsource=["']([^"']+)["']/i.exec(attrs)?.[1]);
    if (shape !== undefined || tokens !== undefined || screens !== undefined) authoredAny = true;
    // An unrecognised token counts as a surface: validating the vocabulary is
    // the shape rule's job, and treating an unknown value as "no surface"
    // would let a typo silently disclaim one.
    if (shape !== undefined && shape !== 'none') sawSurface = true;
    if (tokens !== undefined) paths.push({ path: tokens, kind: 'tokens', specId, ratified });
    if (screens !== undefined) paths.push({ path: screens, kind: 'screens', specId, ratified });
    if (source !== undefined) sources.push(source);
  }
  // An entirely unfilled scaffold contributes nothing at all — the same as a
  // design that carries no declaration.
  if (!authoredAny) return null;
  return { paths, sawSurface, sources };
}

/**
 * `null` when no contributing design carries a declaration at all — detection
 * then runs exactly as it would have, which is what keeps FR-004's "detection
 * MUST continue to run" true by construction rather than by discipline.
 */
export function declaredVisualState(cwd: string): VisualDeclarationState | null {
  let specDirs: string[];
  try {
    specDirs = readdirSync(join(cwd, 'specs'), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return null; // no specs/ — nothing declared
  }

  const declaredPaths: DeclaredVisualPath[] = [];
  const populatedSpecs: string[] = [];
  const sources: string[] = [];
  let sawDeclaration = false;
  let sawSurface = false;

  for (const specId of specDirs) {
    let html: string;
    try {
      html = readFileSync(join(cwd, 'specs', specId, 'design.html'), 'utf8');
    } catch {
      continue; // no design in this spec dir
    }
    const visuals = readDesignVisuals(html, specId);
    if (visuals === null) continue; // declares nothing, or retired
    sawDeclaration = true;
    declaredPaths.push(...visuals.paths);
    sources.push(...visuals.sources);
    if (visuals.sawSurface) {
      sawSurface = true;
      populatedSpecs.push(specId);
    }
  }

  if (!sawDeclaration) return null;
  return { declaredPaths, declaresNoSurface: !sawSurface, populatedSpecs, sources };
}

/**
 * Whether this project has a user interface, composing the declaration with
 * inference (FR-004).
 *
 * A declaration outranks detection **in both directions**: a declared surface
 * stands where nothing was detected, and a declared `none` stands where
 * something was. 073 FR-003 settles this for interfaces on identical
 * reasoning — inference cannot see intent, a declaration can — and the same
 * reasoning applies unchanged here.
 *
 * Detection always runs and its result is always reported, even when a
 * declaration overrides it. That is not defensive; it is the requirement. A
 * project must not be able to go quiet by forgetting, and a reader deciding
 * whether a declared `none` is still true needs to see what the tool saw.
 */
export function userInterfaceState(cwd: string): UserInterfaceState {
  const detection = detectUserInterface(cwd);
  const declared = declaredVisualState(cwd);

  if (declared !== null) {
    return {
      hasInterface: !declared.declaresNoSurface,
      basis: 'declared',
      detected: detection.detected,
      signals: detection.signals,
    };
  }

  return {
    hasInterface: detection.detected,
    basis: detection.detected ? 'detected' : 'absent',
    detected: detection.detected,
    signals: detection.signals,
  };
}

export interface UserInterfaceState {
  /** The answer the gate acts on. */
  hasInterface: boolean;
  /** What decided it — `declared` always wins where a declaration exists. */
  basis: 'declared' | 'detected' | 'absent';
  /** What inference saw, reported whether or not it decided anything. */
  detected: boolean;
  /** The signals that fired, so a finding can say why. */
  signals: string[];
}

/**
 * Whether the project has a visual surface at all — the antecedent the gating
 * check keys on (FR-002).
 *
 * Deliberately NOT `userInterfaceState().hasInterface`, and the difference
 * matters. That function answers "does this project have a user interface",
 * where a declared `none` is a real answer that overrides detection. This one
 * answers the narrower question the gate needs: is there any basis at all for a
 * design in this project to be carrying a Visual surface section — either
 * something detected, or some design genuinely declaring a surface.
 *
 * A declared `none` is therefore NOT a basis. That is what makes FR-007 hold:
 * the explicit-none form belongs inside a section the gate admits, so in a
 * project with no interface a considered "none" is still a section that should
 * not exist.
 */
export function projectHasVisualSurface(cwd: string): boolean {
  if (detectUserInterface(cwd).detected) return true;
  const declared = declaredVisualState(cwd);
  return declared !== null && !declared.declaresNoSurface;
}
