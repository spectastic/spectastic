/**
 * Visual view materialisation (spec 099-visual-embedded-view).
 *
 * The chassis is the contract view's: the artifact content policy is
 * deny-by-default, so a declared file's contents cannot be transcluded at view
 * time and are copied in at generate time instead — which is what makes the
 * drift check in validate.ts necessary rather than optional.
 *
 * ONE THING IS DELIBERATELY NOT A CLONE (FR-002, design D-002). The contract
 * view projects an escaped, line-capped excerpt, because a contract file is
 * opaque text and an excerpt is the only projection available. The visual
 * sidecars are this tool's own vocabulary and can be READ, so this derives
 * tables instead. Measured before choosing: the worked example's three
 * sidecars are 13.8 KB against a 23 KB design, so projecting them verbatim
 * would roughly double the artifact.
 *
 * Works on raw HTML by regex for the injection, matching the contract
 * materialiser and apply.ts's deterministic string-mutation style; the
 * PROJECTION parses, because it is reading structure rather than splicing it.
 * Lives in core rather than schema precisely because it touches the
 * filesystem, which the schema package's pure rules never do.
 */

import { findAll, getAttr, parse } from '@spectastic/schema/parser';
import { readVisualDeclarations } from '@spectastic/schema/visual';
import type { FileSystem } from '../types.js';
import { type DeclaredRender, readRenders, renderAltText } from './render.js';

const VISUAL_RE = /<spec-visual([^>]*)>([\s\S]*?)<\/spec-visual>/g;
const EXISTING_VIEW_RE = /\s*<spec-visual-view[^>]*>[\s\S]*?<\/spec-visual-view>\s*/g;

/** Default cap on projected rows. Generous enough for a real feature, bounded
 *  enough that a large sidecar cannot dominate the artifact (FR-011). */
const DEFAULT_ROW_BUDGET = 60;

export function escapeText(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface ProjectedScreen {
  id: string;
  states: { id: string; source: string; from: string | undefined }[];
  annotations: { target: string | undefined; layer: string | undefined; role: string | undefined }[];
  renders: DeclaredRender[];
}

export interface ViewModel {
  screens: ProjectedScreen[];
  /** True when the row budget truncated something, so the view can say so. */
  truncated: boolean;
}

/**
 * Derive the model from a screens sidecar. Pure — the caller has already read
 * the bytes, which is what keeps the interesting cases testable without a
 * fixture project per assertion.
 */
export function projectScreens(html: string, file = 'screen.html', rowBudget = DEFAULT_ROW_BUDGET): ViewModel {
  const doc = parse(html, file);
  const screens: ProjectedScreen[] = [];
  let rows = 0;
  let truncated = false;

  for (const screenEl of findAll(doc.ast, 'spec-screen')) {
    const id = getAttr(screenEl, 'id') ?? '';
    const states: ProjectedScreen['states'] = [];
    for (const stateEl of findAll(screenEl, 'spec-state')) {
      if (rows >= rowBudget) {
        truncated = true;
        break;
      }
      rows += 1;
      states.push({
        id: getAttr(stateEl, 'id') ?? '',
        source: getAttr(stateEl, 'source') ?? '',
        from: getAttr(stateEl, 'from'),
      });
    }
    const annotations: ProjectedScreen['annotations'] = findAll(screenEl, 'spec-annotation').map((a) => ({
      target: getAttr(a, 'target'),
      layer: getAttr(a, 'layer'),
      role: getAttr(a, 'role'),
    }));
    screens.push({ id, states, annotations, renders: readRenders({ ast: screenEl }) });
  }
  return { screens, truncated };
}

/** Render the model as the markup injected into the declaration. */
export function renderView(model: ViewModel): string {
  if (model.screens.length === 0) return '';
  const parts: string[] = [];
  for (const s of model.screens) {
    parts.push(`<h4>${escapeText(s.id)}</h4>`);
    if (s.states.length > 0) {
      const rows = s.states
        .map(
          (st) =>
            `<tr><td><code>${escapeText(st.id)}</code></td><td>${escapeText(st.source)}</td><td>${
              st.from === undefined ? '—' : `<code>${escapeText(st.from)}</code>`
            }</td></tr>`,
        )
        .join('');
      parts.push(
        `<div style="overflow-x:auto;"><table><thead><tr><th>State</th><th>Source</th><th>From</th></tr></thead><tbody>${rows}</tbody></table></div>`,
      );
    }
    const annotated = s.annotations.filter((a) => a.target !== undefined || a.layer !== undefined);
    if (annotated.length > 0) {
      const rows = annotated
        .map(
          (a) =>
            `<tr><td>${a.target === undefined ? '—' : `<code>${escapeText(a.target)}</code>`}</td><td>${
              a.layer === undefined ? '—' : escapeText(a.layer)
            }</td><td>${a.role === undefined ? '—' : `<code>${escapeText(a.role)}</code>`}</td></tr>`,
        )
        .join('');
      parts.push(
        `<div style="overflow-x:auto;"><table><thead><tr><th>Target</th><th>Layer</th><th>Role</th></tr></thead><tbody>${rows}</tbody></table></div>`,
      );
    }
    // Referenced, never embedded (FR-008): img-src 'self' permits a same-origin
    // file, and a data: URI in src= is an error-severity violation.
    for (const r of s.renders) {
      parts.push(
        `<figure><img src="${escapeText(r.src)}" alt="${escapeText(renderAltText(r, s.id))}"><figcaption>${escapeText(
          renderAltText(r, s.id),
        )}</figcaption></figure>`,
      );
    }
  }
  if (model.truncated) {
    parts.push('<p><em>Truncated — the declared screens carry more states than this view projects.</em></p>');
  }
  return `<spec-visual-view screens="${model.screens.length}"${
    model.truncated ? ' truncated="true"' : ''
  }>${parts.join('')}</spec-visual-view>`;
}

/**
 * Inject or refresh the view inside each `<spec-visual>` declaration.
 *
 * Idempotent: a regeneration REPLACES any existing view rather than appending
 * a second (FR-007). A declaration whose screens path is absent, unreadable or
 * carries no screens is left with no view at all (FR-010) — the declaration
 * stands alone rather than rendering an empty box, which would read as "there
 * is nothing there" and be a different, false claim.
 */
export async function materialiseVisualViews(
  html: string,
  fs: FileSystem,
  cwd: string,
  rowBudget = DEFAULT_ROW_BUDGET,
): Promise<string> {
  const declarations = readVisualDeclarations(html, 'design.html');
  if (declarations.length === 0) return html;

  let result = html;
  for (const match of [...html.matchAll(VISUAL_RE)]) {
    const [full, attrs = '', inner = ''] = match;
    const screensPath = /\bscreens=["']([^"']+)["']/i.exec(attrs)?.[1];
    if (screensPath === undefined) continue; // shape="none" or malformed

    // Strip any existing view, then normalise the trailing whitespace before
    // re-joining. Without this the run is NOT idempotent by exactly one
    // newline: EXISTING_VIEW_RE's leading \s* eats the separator the previous
    // run inserted, so a second pass emits a shorter string than the first.
    const withoutView = inner.replace(EXISTING_VIEW_RE, '').replace(/\s+$/, '');

    let model: ViewModel | null = null;
    try {
      const stat = await fs.stat(`${cwd}/${screensPath}`);
      const files: string[] = stat.isDirectory
        ? (await fs.readdir(`${cwd}/${screensPath}`)).filter((f) => f.endsWith('.html')).map((f) => `${screensPath}/${f}`)
        : [screensPath];
      const merged: ViewModel = { screens: [], truncated: false };
      for (const f of files) {
        const projected = projectScreens(await fs.readFile(`${cwd}/${f}`), f, rowBudget);
        merged.screens.push(...projected.screens);
        merged.truncated ||= projected.truncated;
      }
      model = merged;
    } catch {
      model = null; // unreadable — omit the view (FR-010)
    }

    const view = model === null ? '' : renderView(model);
    const replacement = `<spec-visual${attrs}>${withoutView}\n${view === '' ? '' : `${view}\n`}</spec-visual>`;
    result = result.replace(full, replacement);
  }
  return result;
}
