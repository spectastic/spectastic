import { describe, expect, it } from 'vitest';
import { maskHtmlComments } from '../src/mask-comments.js';
import { materialiseContractViews } from '../src/contracts/materialise-view.js';
import type { FileSystem } from '../src/types.js';

/**
 * The bug this exists for was found by authoring a real design from the shipped
 * template and noticing the contract view never appeared. 072's triage T-001
 * recorded that symptom without a cause; this is the cause.
 */

describe('masking', () => {
  it('blanks a comment while preserving every offset', () => {
    const html = '<p>a</p><!-- hidden --><p>b</p>';
    const masked = maskHtmlComments(html);
    expect(masked.length).toBe(html.length);
    expect(masked).toContain('<p>a</p>');
    expect(masked).not.toContain('hidden');
    expect(masked.indexOf('<p>b</p>')).toBe(html.indexOf('<p>b</p>'));
  });

  it('preserves newlines, so line reporting is unaffected', () => {
    const masked = maskHtmlComments('<!--\na\nb\n-->');
    expect(masked.split('\n')).toHaveLength(4);
  });

  it('tolerates an unterminated comment rather than dropping the rest of the file', () => {
    expect(maskHtmlComments('<p>a</p><!-- no end').length).toBe('<p>a</p><!-- no end'.length);
  });
});

describe('a template comment that spells the element out', () => {
  const fs = {
    stat: async () => ({ isFile: true, isDirectory: false }),
    readFile: async () => 'openapi: 3.1.0\ninfo:\n  title: x\n',
  } as unknown as FileSystem;

  // Reduced from templates/design.html, which really does explain the element
  // by naming it — the comment is helpful, and it was silently load-bearing.
  const design = `<body>
<!-- One <spec-contract> per interface the feature exposes. shape="none" records
     an explicit no-interface decision — never omit the element. -->
<spec-contract shape="request-response" path="contracts/rates.openapi.yaml" format="openapi">
  <p>Reasoning.</p>
</spec-contract>
</body>`;

  it('no longer swallows the real declaration', async () => {
    const out = await materialiseContractViews(design, fs, '/repo');
    expect(out).toContain('<spec-contract-view');
  });

  it('leaves the comment itself untouched', async () => {
    const out = await materialiseContractViews(design, fs, '/repo');
    expect(out).toContain('One <spec-contract> per interface');
  });

  it('still materialises when no comment is present', async () => {
    const bare = '<spec-contract shape="request-response" path="c.yaml" format="openapi"><p>r</p></spec-contract>';
    expect(await materialiseContractViews(bare, fs, '/repo')).toContain('<spec-contract-view');
  });
});

/**
 * A second bug, found only because the first fix made the code reachable.
 * A contract's own content is spliced into the document through
 * `String.replace`, whose replacement STRING treats `$&`, `$'` and `` $` `` as
 * substitution patterns — and an OpenAPI schema carries regex patterns like
 * `'^[A-Z]{3}$'` as a matter of course.
 */
describe('a contract containing replacement-pattern sequences', () => {
  const withPattern = (yaml: string) =>
    ({
      stat: async () => ({ isFile: true, isDirectory: false }),
      readFile: async () => yaml,
    }) as unknown as FileSystem;

  const design =
    '<body><spec-contract shape="request-response" path="c.yaml" format="openapi"><p>r</p></spec-contract><p>AFTER</p></body>';

  it("does not splice the rest of the document in on $'", async () => {
    const out = await materialiseContractViews(design, withPattern("pattern: '^[A-Z]{3}$'\n"), '/repo');
    // One occurrence — not one inside the view and one after it.
    expect(out.split('AFTER')).toHaveLength(2);
    expect(out).toContain('[A-Z]{3}');
  });

  it('does not duplicate the match on $&', async () => {
    const out = await materialiseContractViews(design, withPattern('note: cost is $& per call\n'), '/repo');
    expect(out.split('spec-contract-view')).toHaveLength(3); // one open, one close
    expect(out).toContain('$&amp;');
  });

  it('leaves a $1 alone rather than resolving it to a capture group', async () => {
    const out = await materialiseContractViews(design, withPattern('replacement: $1\n'), '/repo');
    expect(out).toContain('replacement: $1');
  });
});
