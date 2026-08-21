/**
 * The Markdown renderer (spec 107-visual-design-brief, T-111,
 * FR-002/FR-003/FR-005/FR-006/FR-007/FR-008, NFR-002).
 *
 * One line per state naming its exact label — the state's own `id`, verbatim
 * (D-004: that IS the mechanism). No slugging, no derivation. Pure: the date
 * is an argument, never a clock read here (D-003), which is what makes
 * NFR-002's byte-identity a property of the function rather than a hope.
 *
 * Fencing (D-005, FR-005): the refusal bodies are the artifact prose taken
 * verbatim into this output, so they are the one block wrapped with
 * `fenceArtifactText`. Annotation fields (target/layer/role) are short
 * controlled-vocabulary tokens, not authored prose, and are emitted plainly —
 * fencing them would bury the load-bearing labels in boilerplate for no
 * injection-surface reason.
 */

import { fenceArtifactText } from '@spectastic/schema/fence';
import type { BriefModel } from './brief-read.js';

function renderScreen(screen: BriefModel['screens'][number]): string {
  const lines = screen.states.map((s) => {
    const from = s.from === undefined ? '' : ` (from \`${s.from}\`)`;
    return `- \`${s.id}\` — ${s.source}${from}`;
  });
  return `### ${screen.id}\n\n${lines.join('\n')}`;
}

function renderRefusals(refusals: BriefModel['refusals']): string {
  if (refusals.length === 0) return '';
  const lines = refusals.map((r) => {
    const ctx = r.context === undefined ? '' : ` (context: ${r.context})`;
    return `- "${r.text}"${ctx} — ${r.body}`;
  });
  const fenced = fenceArtifactText(lines.join('\n'), 'Refusals');
  return `\n## Do not draw\n\n${fenced}\n`;
}

function renderAnnotations(screens: BriefModel['screens']): string {
  const all = screens.flatMap((s) => s.annotations);
  if (all.length === 0) return '';
  const lines = all.map((a) => {
    const parts = [
      a.layer,
      a.role,
      a.ariaState ? `aria-${a.ariaState}` : undefined,
      a.cites ? `cites ${a.cites}` : undefined,
    ].filter((p): p is string => p !== undefined);
    return `- \`${a.target ?? ''}\` — ${parts.join(', ')}`;
  });
  return `\n## Accessibility & behaviour\n\n${lines.join('\n')}\n`;
}

function renderContexts(model: BriefModel): string {
  const addressed = model.addressedContexts.length === 0 ? 'not recorded' : model.addressedContexts.join(' ');
  const declined =
    model.declinedContexts.length === 0
      ? ''
      : `\n\n### Declined\n\n${model.declinedContexts.map((d) => `- ${d.axis}=${d.context} — ${d.reason}`).join('\n')}`;
  return `\n## Contexts to draw\n\n${addressed}${declined}\n`;
}

/** Render a complete brief model as Markdown. Pure — the same model and the
 *  same date always produce the same string (NFR-002). */
export function renderBrief(model: BriefModel, date: string): string {
  const header = `# Design brief — ${date}`;
  const labels =
    `\n## Artboard labels (exact)\n\nEvery artboard MUST carry the exact label shown below. A label with no ` +
    `match here is not a request.\n\n${model.screens.map(renderScreen).join('\n\n')}\n`;
  const undeclared =
    `\n## Undeclared states\n\nA state your design includes that is not listed under "Artboard labels" above has ` +
    `no declaration. It will be reported as undeclared and attributed to this design when the render is reviewed — ` +
    `never adopted automatically. Label its artboard clearly, e.g. \`undeclared-<name>\`, so it is identifiable.\n`;

  return (
    [
      header,
      labels,
      renderRefusals(model.refusals),
      renderAnnotations(model.screens),
      renderContexts(model),
      undeclared,
    ]
      .join('')
      .trim() + '\n'
  );
}
