/**
 * Contract view materialisation (spec 072-contract-embedded-view). The
 * artifact CSP is deny-by-default with no `connect-src`, so a contract's
 * shape cannot be transcluded at view time — it is copied into the artifact
 * at generate time instead (design D-001), which is what makes the drift
 * check in validate.ts necessary rather than optional.
 *
 * Works on raw HTML by regex, matching the rest of the core kernel's
 * deterministic string-mutation style (apply.ts's <spec-delta> handling,
 * etc.) rather than the schema package's full-AST parse — this module lives
 * in core precisely because it touches the filesystem, which the schema
 * package's pure-AST rules never do (070's D-002 precedent).
 */

import type { FileSystem } from '../types.js';
import { maskHtmlComments } from '../mask-comments.js';

/** Default excerpt cap (D-006): generous enough for real review, bounded enough
 * that a 5000-line contract doesn't bloat the artifact past NFR-003's budget. */
const DEFAULT_LINE_BUDGET = 500;

const CONTRACT_RE = /<spec-contract([^>]*)>([\s\S]*?)<\/spec-contract>/g;
const PATH_ATTR_RE = /\bpath=["']([^"']+)["']/;
const EXISTING_VIEW_RE = /\s*<spec-contract-view[^>]*>[\s\S]*?<\/spec-contract-view>\s*/g;

export function escapeContractText(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function unescapeContractText(s: string): string {
  return String(s)
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

/**
 * Read each `<spec-contract path=…>` declaration's file and inject (or
 * refresh) a nested `<spec-contract-view lines="N" [excerpt="true"]>` holding
 * escaped, line-capped text. Idempotent: a regeneration replaces any existing
 * view rather than duplicating it. A declaration with no `path=` (shape="none"
 * or malformed), or whose file is absent/unreadable/not text, is left with no
 * view at all (FR-007) — the declaration stands alone rather than rendering
 * an empty box.
 */
export async function materialiseContractViews(
  html: string,
  fs: FileSystem,
  cwd: string,
  lineBudget = DEFAULT_LINE_BUDGET,
): Promise<string> {
  // Matched against a comment-masked copy, then sliced out of the original.
  // The mask preserves every offset, so `full`/`attrs`/`inner` below are the
  // real bytes — see mask-comments.ts for why this is not paranoia.
  const masked = maskHtmlComments(html);
  const matches = [...masked.matchAll(CONTRACT_RE)].map((m) => {
    const start = m.index ?? 0;
    const real = html.slice(start, start + m[0].length);
    const openEnd = real.indexOf('>');
    return [real, real.slice('<spec-contract'.length, openEnd), real.slice(openEnd + 1, real.lastIndexOf('</spec-contract>'))] as [
      string,
      string,
      string,
    ];
  });
  if (matches.length === 0) return html;

  let result = html;
  for (const match of matches) {
    const [full, attrs = '', inner = ''] = match;
    // 072 T-003: every path below that declines to WRITE a view must also
    // REMOVE one already there. `omit()` is that, and it exists because five
    // `continue`s used to leave an orphan — a view projecting a file that is
    // gone, which `contract-view-stale` then reports and which regenerating
    // could not clear, because the strip lived only in the success branch. The
    // fix hint has always said "refresh or remove"; only refresh was built.
    const omit = (): void => {
      const stripped = inner.replace(EXISTING_VIEW_RE, '');
      if (stripped === inner) return; // nothing there — nothing to remove
      // Replacer FUNCTION for the same reason the write path uses one: a
      // contract's own text carries `$'` and `$&`, which a replacement STRING
      // would treat as substitution patterns.
      result = result.replace(full, () => `<spec-contract${attrs}>${stripped}\n</spec-contract>`);
    };

    const pathMatch = PATH_ATTR_RE.exec(attrs);
    if (!pathMatch) {
      omit(); // no declared path — a view here projects nothing
      continue;
    }

    const resolvedPath = `${cwd}/${pathMatch[1]}`;

    let stat: { isFile: boolean; isDirectory: boolean };
    try {
      stat = await fs.stat(resolvedPath);
    } catch {
      omit(); // absent — omit the view (FR-007)
      continue;
    }
    if (!stat.isFile) {
      omit(); // a directory — omit
      continue;
    }

    let content: string;
    try {
      content = await fs.readFile(resolvedPath, 'utf8');
    } catch {
      omit(); // unreadable — omit (FR-007)
      continue;
    }
    if (content.includes('\0')) {
      omit(); // not text — omit (FR-007)
      continue;
    }

    // A file conventionally ends with exactly one trailing newline; splitting
    // on '\n' without stripping it first produces a trailing empty element
    // ("a\nb\n".split('\n') → ["a","b",""]) and over-counts by one against
    // what a reader means by "N lines". Strip a single trailing newline
    // before splitting so the count and the excerpt slice both match.
    const withoutTrailingNewline = content.endsWith('\n') ? content.slice(0, -1) : content;
    const lines = withoutTrailingNewline.split('\n');
    const totalLines = lines.length;
    const isExcerpt = totalLines > lineBudget;
    const shown = isExcerpt ? lines.slice(0, lineBudget).join('\n') : withoutTrailingNewline;
    const declaredPath = pathMatch[1]!;
    // tabindex + aria-label (P-13): a scrollable region a keyboard user cannot
    // reach or identify fails accessibility; the label names the projected
    // file, since the region's own visible ::before label omits it (spec.css
    // attr() can only read this element's own attributes, not its parent's).
    const ariaLabel = escapeContractText(`Projection of ${declaredPath}`);
    const viewEl = `<spec-contract-view lines="${totalLines}"${isExcerpt ? ' excerpt="true"' : ''} tabindex="0" aria-label="${ariaLabel}">${escapeContractText(shown)}</spec-contract-view>`;

    const innerWithoutView = inner.replace(EXISTING_VIEW_RE, '');
    const replacement = `<spec-contract${attrs}>${innerWithoutView}\n${viewEl}\n</spec-contract>`;
    // A REPLACER FUNCTION, not a replacement string. `String.replace` treats
    // `$&`, `$'`, `` $` `` and `$1` in a replacement STRING as substitution
    // patterns — and `$'` splices in everything after the match. A contract is
    // exactly where those sequences occur naturally: an OpenAPI schema carries
    // regex patterns like `'^[A-Z]{3}$'`, whose `$'` swallowed the entire rest
    // of the document. Found the first time a real contract was ever projected,
    // because the view had never materialised on the authoring path before.
    result = result.replace(full, () => replacement);
  }

  return result;
}
