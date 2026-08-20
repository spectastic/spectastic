import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser.js';
import { noUnreplacedPlaceholderRule } from '../src/rules/no-unreplaced-placeholder.js';
import { specElementNestingRule } from '../src/rules/spec-element-nesting.js';

/**
 * REQ-FORMAT-008 / REQ-FORMAT-009 (091-artifact-format).
 *
 * Both rules read the source rather than the parsed tree, so each is proved
 * against a planted defect before being trusted — the discipline the proposal
 * wrote into its own task list, and the one that catches a rule which reports
 * clean because it is looking at the wrong thing.
 */

const doc = (body: string, status = 'accepted') =>
  parse(
    `<!doctype html><html><head><title>t</title></head><body>
     <spec-status value="${status}">S</spec-status>${body}</body></html>`,
    'test.html',
  );

describe('spec-element-nesting (REQ-FORMAT-008)', () => {
  it('catches the motivating typo — </spike> for </spec-status> — as an unclosed element', () => {
    // The scan only sees spec-* tags, so a typo'd close that is NOT spec-*
    // is invisible to it directly. It is caught by the element the typo left
    // open, which points at the broken element rather than the stray tag.
    const f = specElementNestingRule.check({ doc: doc('<spec-status value="draft">Draft</spike>', 'draft') });
    expect(f.map((x) => x.message)).toContain('<spec-status> is never closed.');
  });

  it('reports a spec-* closing tag matching no open element', () => {
    const f = specElementNestingRule.check({ doc: doc('<p>hi</spec-note>') });
    expect(f.map((x) => x.message)).toContain('Closing tag </spec-note> matches no open element.');
  });

  it('reports an element left open by a mismatched close', () => {
    const f = specElementNestingRule.check({ doc: doc('<spec-note><spec-rule>x</spec-note>') });
    expect(f.some((x) => x.message.includes('<spec-rule> is not closed'))).toBe(true);
  });

  it('reports an element that is never closed', () => {
    const f = specElementNestingRule.check({ doc: doc('<spec-note>dangling') });
    expect(f.map((x) => x.message)).toContain('<spec-note> is never closed.');
  });

  it('is silent on well-formed nesting', () => {
    const f = specElementNestingRule.check({ doc: doc('<spec-note><spec-rule>MUST</spec-rule></spec-note>') });
    expect(f).toEqual([]);
  });

  it('ignores ordinary HTML, which never closes and is not this rule’s business', () => {
    // REQ-FORMAT-001 mandates inlined SVG; void elements are everywhere.
    const f = specElementNestingRule.check({
      doc: doc('<meta charset="utf-8"><input type="checkbox"><svg><path d="M0 0"/></svg>'),
    });
    expect(f).toEqual([]);
  });

  it('does not read a style selector or a script comparison as markup', () => {
    const f = specElementNestingRule.check({
      doc: doc('<style>a[x] > b { color: red }</style><script>if (a < b) {}</script>'),
    });
    expect(f).toEqual([]);
  });

  // 091/T-002. The suppression for <pre>/<code> was deliberate and its stated
  // reason was wrong: "a <pre> block showing `spectastic run <spec-id>` is
  // naming the element rather than opening one." The HTML parser does not
  // share that intent — it opens a SPEC-ID element and swallows everything
  // after it. 037's design.html lost 251 characters of a documented command
  // that way, invisibly, because the rule declined to look.
  it('reports an unescaped spec-* tag inside <pre> — the parser opens it regardless of intent', () => {
    const f = specElementNestingRule.check({ doc: doc('<pre><code>spectastic run <spec-id></code></pre>') });
    expect(f.map((x) => x.message)).toContain('<spec-id> is never closed.');
  });

  it('reports an unescaped spec-* tag inside a bare <code> span', () => {
    const f = specElementNestingRule.check({ doc: doc('<p>run <code><spec-note></code></p>') });
    expect(f.map((x) => x.message)).toContain('<spec-note> is never closed.');
  });

  it('is silent when the same example is escaped, which is the estate convention', () => {
    const f = specElementNestingRule.check({
      doc: doc('<pre><code>spectastic run &lt;spec-id&gt;</code></pre>'),
    });
    expect(f).toEqual([]);
  });

  it('still skips <spec-diff> content, whose del/ins bodies are literal source', () => {
    const f = specElementNestingRule.check({
      doc: doc('<spec-diff><del><spec-note>old</del><ins>new</ins></spec-diff>'),
    });
    expect(f).toEqual([]);
  });
});

describe('no-unreplaced-placeholder (REQ-FORMAT-009)', () => {
  it('reports a bare placeholder', () => {
    const f = noUnreplacedPlaceholderRule.check({ doc: doc('<p>[CHANGE_TITLE]</p>') });
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toBe('Unreplaced template placeholder [CHANGE_TITLE].');
  });

  it('exempts quotation in code, pre and a diff', () => {
    const f = noUnreplacedPlaceholderRule.check({
      doc: doc('<code>[SPEC_ID]</code><pre>[FEATURE_NAME]</pre><spec-diff><del>[SPEC_ID]</del></spec-diff>'),
    });
    expect(f).toEqual([]);
  });

  it('errors once accepted, warns while draft', () => {
    expect(noUnreplacedPlaceholderRule.check({ doc: doc('<p>[X_NAME]</p>', 'accepted') })[0]?.severity).toBe('error');
    expect(noUnreplacedPlaceholderRule.check({ doc: doc('<p>[X_NAME]</p>', 'draft') })[0]?.severity).toBe('warning');
  });

  it('is silent on a frozen archive, which can never be edited to satisfy a gate', () => {
    // 088 calls an archived proposal a stable fact; see the rule header.
    expect(noUnreplacedPlaceholderRule.check({ doc: doc('<p>[X_NAME]</p>', 'applied') })).toEqual([]);
    expect(noUnreplacedPlaceholderRule.check({ doc: doc('<p>[X_NAME]</p>', 'withdrawn') })).toEqual([]);
  });
});

describe('both rules skip HTML comments', () => {
  it('does not read a commented-out example as markup', () => {
    // templates/spec.html documents <spec-note> and <spec-sidenote> inside a
    // comment; the first corpus run reported both as never closed.
    const f = specElementNestingRule.check({
      doc: parse(
        `<!doctype html><html><head><title>t</title></head><body>
         <spec-status value="draft">S</spec-status>
         <!-- A <spec-note> sits in the flow; a <spec-sidenote> is an aside. -->
         </body></html>`,
        'test.html',
      ),
    });
    expect(f).toEqual([]);
  });

  it('does not report a placeholder inside a comment, which is not published copy', () => {
    const f = noUnreplacedPlaceholderRule.check({
      doc: parse(
        `<!doctype html><html><head><title>t</title></head><body>
         <spec-status value="accepted">S</spec-status>
         <!-- <spec-sidenote>[AN_ASIDE — marginalia.]</spec-sidenote> -->
         </body></html>`,
        'test.html',
      ),
    });
    expect(f).toEqual([]);
  });
});
