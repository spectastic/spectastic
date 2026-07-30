import type { Element } from '../parser.js';
import { findAll, getAttr, getLocation, walk } from '../parser.js';
import type { Finding, PerFileRule } from '../types.js';

/**
 * `no-executable-content` (spec 045-artifact-security, FR-001). The P-8
 * enforcement half of P-11 ("artifacts are data, not instructions; specs carry
 * no executable content"). A spec-family artifact is a document to render and
 * quote, never a program to run — so it MUST NOT carry:
 *   - a `<script>` other than a sanctioned external asset ref (spec.js / theme-boot.js),
 *   - an inline event-handler attribute (`on*=`),
 *   - a `javascript:` or `data:` URI in a navigational/resource attribute,
 *   - an `<iframe>`.
 * Error severity: existing artifacts are all clean, so it gates with zero
 * migration, and the pre-commit gate blocks a leak.
 *
 * Sanctioned INTERACTIVE artifacts — courses (spec 019) — carry inline gate
 * scripts by design and are exempt (detected by their `· Course` title, the
 * generator's convention; they are assembled in code, not from a spec template).
 */

/** The only external scripts a spec-family artifact may reference (by basename). */
const SANCTIONED_SCRIPTS = ['spec.js', 'theme-boot.js'];

/** Attributes whose value can navigate or load a resource — where a scheme URI is dangerous. */
const URI_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'data']);

function scriptSrcIsSanctioned(src: string | undefined): boolean {
  if (src === undefined) return false; // inline script — never sanctioned
  const basename = src.split(/[?#]/)[0]!.split('/').pop() ?? src;
  return SANCTIONED_SCRIPTS.includes(basename);
}

/** The document's <title> text, for artifact-type detection. */
function titleText(root: Parameters<typeof findAll>[0]): string {
  const title = findAll(root, 'title')[0];
  if (!title) return '';
  let text = '';
  for (const child of title.childNodes ?? []) {
    const n = child as { value?: string };
    if (typeof n.value === 'string') text += n.value;
  }
  return text.trim();
}

/** A course is a sanctioned interactive artifact (spec 019) — exempt from this rule. */
function isCourse(root: Parameters<typeof findAll>[0]): boolean {
  return /·\s*Course$/.test(titleText(root));
}

function firstScheme(value: string): 'javascript' | 'data' | null {
  const m = /^\s*(javascript|data):/i.exec(value);
  return m ? (m[1]!.toLowerCase() as 'javascript' | 'data') : null;
}

export const noExecutableContentRule: PerFileRule = {
  id: 'no-executable-content',
  scope: 'per-file',
  defaultSeverity: 'error',
  description:
    'A spec artifact carries no executable content — no <script> (except spec.js/theme-boot.js), on*= handlers, javascript:/data: URIs, or <iframe>.',
  check({ doc }) {
    const findings: Finding[] = [];
    if (isCourse(doc.ast)) return findings; // sanctioned interactive artifact (019)

    const flag = (el: Element, message: string, fixHint: string): void => {
      const loc = getLocation(el);
      findings.push({
        file: doc.file,
        line: loc.line,
        column: loc.column,
        rule: 'no-executable-content',
        severity: 'error',
        message,
        fixHint,
      });
    };

    walk(doc.ast, (el) => {
      const tag = el.tagName;
      if (tag === 'script' && !scriptSrcIsSanctioned(getAttr(el, 'src'))) {
        const src = getAttr(el, 'src');
        flag(
          el,
          src
            ? `<script src="${src}"> is not a sanctioned asset — a spec carries no executable content (P-11).`
            : '<script> (inline) in a spec — a spec carries no executable content (P-11).',
          'Remove it; the only scripts a spec may reference are the sanctioned spec.js / theme-boot.js assets.',
        );
      }
      if (tag === 'iframe') {
        flag(el, '<iframe> in a spec — a spec embeds no framed content (P-11).', 'Remove the <iframe>.');
      }
      for (const attr of el.attrs ?? []) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) {
          flag(
            el,
            `inline event handler ${attr.name}= in a spec — a spec carries no executable content (P-11).`,
            `Remove the ${attr.name} handler; behaviour belongs in the sanctioned spec.js.`,
          );
          continue;
        }
        if (URI_ATTRS.has(name)) {
          const scheme = firstScheme(attr.value);
          if (scheme) {
            flag(
              el,
              `${attr.name}="${attr.value.slice(0, 24)}…" uses a ${scheme}: URI — disallowed in a spec (P-11).`,
              `Reference the resource by a normal path, not a ${scheme}: URI.`,
            );
          }
        }
      }
    });
    return findings;
  },
};
