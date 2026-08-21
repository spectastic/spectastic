import type { Finding, PerFileRule } from '../types.js';

/**
 * Flag a `<spec-*>` element whose source nesting does not close, matched and
 * in order (REQ-FORMAT-008 of the meta-spec).
 *
 * This is the one rule in the engine that reads `doc.html` rather than
 * `doc.ast`, and it has to. parse5 repairs a mismatched end tag on the way in
 * — `genericEndTagInBody` walks the open-element stack and discards a tag it
 * cannot match, without raising a parse error — so by the time any other rule
 * sees a document, the defect is gone. A design authored with `</spike>`
 * closing a `<spec-status>` validated clean for months.
 *
 * Scoped to `<spec-*>` deliberately. An artifact is mostly ordinary HTML:
 * `<meta>`, `<link>` and `<input>` never close, and REQ-FORMAT-001 mandates
 * inlined SVG whose `<path/>` is self-closing — so a check over *every*
 * element would report the entire estate. The tool's own vocabulary always
 * carries explicit closing tags, which is what makes a stack scan decidable.
 *
 * Raw-text elements are skipped before scanning: a `<style>` selector and an
 * inlined script's `a < b` both look like tags to a naive stack, and neither
 * is markup the parser will act on.
 *
 * `<pre>` and `<code>` are NOT skipped, and the reason they once were is worth
 * keeping (091/T-002). The original note read: "a `<pre>` block showing
 * `spectastic run <spec-id>` is naming the element rather than opening one."
 * That is authorial intent, and the HTML parser does not share it — `<pre>`
 * and `<code>` are ordinary element content, so an unescaped `<spec-id>` opens
 * a real element and swallows what follows. `037-hands-off-pipeline`'s design
 * lost 251 characters of a documented command exactly that way, invisibly,
 * because this rule declined to look. Escaping is already the estate's
 * convention — verified across 500 artifacts, the narrowed scan reports no new
 * findings — so the suppression bought nothing and hid a live defect class.
 */

/**
 * Spans the scan must not read: `<style>`/`<script>` content, and HTML
 * comments. The comment case is not hypothetical — `templates/spec.html`
 * documents `<spec-note>` and `<spec-sidenote>` inside a comment explaining
 * when to use each, and a scan that reads those as markup reports two
 * unclosed elements in a file where nothing is wrong.
 */
function rawTextSpans(html: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const comment = /<!--/g;
  let c: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: the standard regex-iteration idiom. Hoisting the exec out of the condition would need a re-exec before every `continue` in the body, and a missed one is an infinite loop in a validate rule.
  while ((c = comment.exec(html))) {
    const end = html.indexOf('-->', c.index);
    spans.push([c.index, end === -1 ? html.length : end + 3]);
    comment.lastIndex = end === -1 ? html.length : end + 3;
  }
  const re = /<(style|script|spec-diff)\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: the standard regex-iteration idiom. Hoisting the exec out of the condition would need a re-exec before every `continue` in the body, and a missed one is an infinite loop in a validate rule.
  while ((m = re.exec(html))) {
    const tag = (m[1] ?? '').toLowerCase();
    const close = html.toLowerCase().indexOf(`</${tag}`, re.lastIndex);
    const end = close === -1 ? html.length : close;
    // Content only, never the tags themselves: `spec-diff` is a spec-* element
    // that must still balance, so hiding its open tag while leaving its close
    // visible would report every diff in the estate as unmatched.
    spans.push([re.lastIndex, end]);
    re.lastIndex = end;
  }
  return spans;
}

/** Line/column for a source offset, 1-indexed to match parse5's locations. */
function positionAt(html: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (html.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

const TAG_RE = /<(\/?)(spec-[a-z0-9-]+)\b([^>]*)>/gi;

export const specElementNestingRule: PerFileRule = {
  id: 'spec-element-nesting',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    'Every <spec-*> element in the source closes, matched and in order — the parser repairs a mismatch silently (REQ-FORMAT-008).',
  check({ doc }) {
    const html = doc.html;
    const skip = rawTextSpans(html);
    const inRawText = (i: number): boolean => skip.some(([a, b]) => i >= a && i < b);

    const findings: Finding[] = [];
    const stack: Array<{ name: string; offset: number }> = [];
    let m: RegExpExecArray | null;
    TAG_RE.lastIndex = 0;

    // biome-ignore lint/suspicious/noAssignInExpressions: the standard regex-iteration idiom. Hoisting the exec out of the condition would need a re-exec before every `continue` in the body, and a missed one is an infinite loop in a validate rule.
    while ((m = TAG_RE.exec(html))) {
      if (inRawText(m.index)) continue;
      const slash = m[1] ?? '';
      const name = (m[2] ?? '').toLowerCase();
      const attrs = m[3] ?? '';
      // A self-closing custom element is well-formed on its own terms.
      if (!slash && attrs.trimEnd().endsWith('/')) continue;

      if (!slash) {
        stack.push({ name, offset: m.index });
        continue;
      }

      const top = stack[stack.length - 1];
      if (top?.name === name) {
        stack.pop();
        continue;
      }

      // An end tag matching something further down the stack means every
      // element above it was left open; report the innermost, which is the
      // one an author can act on.
      const depth = stack.map((e) => e.name).lastIndexOf(name);
      if (depth === -1) {
        const at = positionAt(html, m.index);
        findings.push({
          file: doc.file,
          line: at.line,
          column: at.column,
          rule: 'spec-element-nesting',
          severity: 'error',
          message: `Closing tag </${name}> matches no open element.`,
          fixHint:
            'The parser discards an unmatched end tag without a diagnostic, so every other rule reads a document that differs from this file. Check for a typo in the tag name.',
        });
        continue;
      }
      const unclosed = stack[depth + 1];
      if (!unclosed) {
        stack.length = depth;
        continue;
      }
      const at = positionAt(html, unclosed.offset);
      findings.push({
        file: doc.file,
        line: at.line,
        column: at.column,
        rule: 'spec-element-nesting',
        severity: 'error',
        message: `<${unclosed.name}> is not closed before </${name}>.`,
        fixHint: `Close <${unclosed.name}> before </${name}>, or correct whichever tag name is wrong.`,
      });
      stack.length = depth;
    }

    for (const open of stack) {
      const at = positionAt(html, open.offset);
      findings.push({
        file: doc.file,
        line: at.line,
        column: at.column,
        rule: 'spec-element-nesting',
        severity: 'error',
        message: `<${open.name}> is never closed.`,
        fixHint: `Add a matching </${open.name}>.`,
      });
    }
    return findings;
  },
};
