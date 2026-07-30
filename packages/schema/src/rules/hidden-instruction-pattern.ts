import type { Document, Element } from '../parser.js';
import { getAttr, getLocation, hasAttr } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';

/**
 * `hidden-instruction-pattern` (spec 045-artifact-security, FR-004). The
 * companion to `no-executable-content`: where that rule is categorical (a
 * `<script>` either is or isn't sanctioned), this one is heuristic — it warns
 * on the two shapes docs/spec-injection-considerations.html names as the
 * hidden-instruction channel: a large `display:none` / `aria-hidden` /
 * off-screen text block, or an HTML comment carrying imperative
 * (model-addressing) language. Warning severity only: false positives are
 * expected on a heuristic, and neither shape is dangerous on its own — this
 * rule exists to surface a suspicious pattern for review, not to gate.
 *
 * The hard boundary is elsewhere: FR-001's categorical rule (error severity)
 * and FR-003's AI-verb fence (which strips exactly these two channels before
 * any artifact text reaches a model, regardless of whether this rule ever
 * runs). This rule is the author-time nudge, not the guarantee.
 */

/** Below this, a hidden/off-screen text block reads as ordinary UI cruft
 * (a visually-hidden label, an icon's sr-only caption) rather than something
 * long enough to carry an instruction — chosen to roughly bound "a short
 * sentence", per FR-004's "large" wording. */
const LARGE_TEXT_THRESHOLD = 40;

const HIDDEN_STYLE_RE = /display\s*:\s*none|visibility\s*:\s*hidden/i;
// Bounded lazy gap, matching the fence's ReDoS-safe pattern (fence.ts).
const OFFSCREEN_STYLE_RE =
  /position\s*:\s*absolute[\s\S]{0,80}?(?:left|top)\s*:\s*-\d{2,}|(?:left|top)\s*:\s*-\d{2,}[\s\S]{0,80}?position\s*:\s*absolute|text-indent\s*:\s*-\d{3,}/i;

function isHiddenElement(el: Element): boolean {
  const ariaHidden = getAttr(el, 'aria-hidden');
  if (ariaHidden !== undefined && /^true$/i.test(ariaHidden)) return true;
  if (hasAttr(el, 'hidden')) return true;
  const style = getAttr(el, 'style');
  if (!style) return false;
  return HIDDEN_STYLE_RE.test(style) || OFFSCREEN_STYLE_RE.test(style);
}

/** True if a parse5 tree node is an Element (has tagName + attrs). */
function isElementNode(node: unknown): node is Element {
  return typeof node === 'object' && node !== null && 'tagName' in node && 'attrs' in node;
}

/** Concatenated text of every descendant text node, trimmed. */
function textLength(el: Element): number {
  let text = '';
  const visit = (node: unknown): void => {
    if (isElementNode(node)) {
      for (const child of node.childNodes ?? []) visit(child);
      return;
    }
    const n = node as { value?: string; childNodes?: unknown[] };
    if (typeof n.value === 'string') text += n.value;
    else if (n.childNodes) for (const child of n.childNodes) visit(child);
  };
  visit(el);
  return text.trim().length;
}

/**
 * Depth-first scan that stops descending once it flags a hidden element —
 * a hidden wrapper's own hidden descendants are already covered by the one
 * warning on the outer element, so this deliberately does not double-flag
 * nested hidden-in-hidden markup.
 */
function scanHiddenBlocks(node: unknown, onHidden: (el: Element) => void): void {
  if (!isElementNode(node)) {
    const n = node as { childNodes?: unknown[] };
    for (const child of n.childNodes ?? []) scanHiddenBlocks(child, onHidden);
    return;
  }
  if (isHiddenElement(node)) {
    onHidden(node);
    return; // don't descend into an already-flagged hidden subtree
  }
  for (const child of node.childNodes ?? []) scanHiddenBlocks(child, onHidden);
}

// Deliberately heuristic (FR-004) — model-addressing, imperative phrasing a
// hidden HTML comment might carry to steer an AI verb ingesting the artifact.
const IMPERATIVE_COMMENT_PATTERNS: ReadonlyArray<RegExp> = [
  /\bignore (all|any|the|previous|prior|above)\b/i,
  /\bdisregard\b/i,
  /\boverride\b/i,
  /\byou must\b/i,
  /\bsystem\s*:/i,
  /\bassistant\s*:/i,
  /\bact as\b/i,
  /\bpretend (to be|you are)\b/i,
  /\bbypass\b/i,
  /\bdo not (tell|mention|reveal)\b/i,
  /\bnew instructions?\s*:/i,
];

function isImperativeComment(body: string): boolean {
  return IMPERATIVE_COMMENT_PATTERNS.some((re) => re.test(body));
}

/** 1-indexed line/column for a raw offset into `html` (comments carry no
 * parse5 sourceCodeLocation the way elements do, so this rule computes its
 * own — the only rule that scans raw text rather than the element tree). */
function locationAt(html: string, index: number): { line: number; column: number } {
  const before = html.slice(0, index);
  const lines = before.split('\n');
  const line = lines.length;
  const column = (lines[lines.length - 1]?.length ?? 0) + 1;
  return { line, column };
}

const COMMENT_RE = /<!--([\s\S]*?)-->/g;

export const hiddenInstructionPatternRule: PerFileRule = {
  id: 'hidden-instruction-pattern',
  scope: 'per-file',
  defaultSeverity: 'warning',
  description:
    'Heuristic: warns on a large display:none/aria-hidden/off-screen text block, or an HTML comment carrying imperative language — the hidden-instruction channel FR-003 fences at ingestion but which authoring can still catch early.',
  check({ doc }) {
    const findings: Finding[] = [];

    scanHiddenBlocks(doc.ast as Document, (el) => {
      const len = textLength(el);
      if (len < LARGE_TEXT_THRESHOLD) return;
      const loc = getLocation(el);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'hidden-instruction-pattern',
        severity: 'warning',
        message: `<${el.tagName}> hides ${len} characters of text (display:none / aria-hidden / off-screen) — review for a smuggled instruction; heuristic, not categorical (FR-004).`,
        fixHint:
          'If this text is legitimately not meant to be read, confirm it carries no directive language; otherwise remove it.',
      });
    });

    COMMENT_RE.lastIndex = 0;
    for (let m = COMMENT_RE.exec(doc.html); m; m = COMMENT_RE.exec(doc.html)) {
      const body = m[1] ?? '';
      if (!isImperativeComment(body)) continue;
      const loc = locationAt(doc.html, m.index);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'hidden-instruction-pattern',
        severity: 'warning',
        message: `HTML comment reads as imperative/model-addressing language — review for a smuggled instruction; heuristic, not categorical (FR-004).`,
        fixHint: 'Rephrase as a plain authoring note, or remove the comment if it is not one.',
      });
    }

    return findings;
  },
};
