import { describe, expect, it } from 'vitest';
import { parse } from '../src/parser.js';
import { noDuplicateIdsRule } from '../src/rules/no-duplicate-ids.js';
import type { Finding, ParsedDocument } from '../src/types.js';

/**
 * `no-duplicate-ids` — project-wide stable IDs are forever-contracts (P-3).
 *
 * The case these tests exist for: a change proposal embeds the requirement's
 * POST-STATE, so a proposal modifying `REQ-TOOL-003` contains an element with
 * that id while the live spec still defines it. Archived and withdrawn
 * proposals are excluded upstream at the CLI glob, which is why this never
 * surfaced — but a proposal is only ever archived *after* it is applied, so
 * the one window in which a proposal actually exists was the one window the
 * rule fired in. Found by authoring four proposals while draining the inbox.
 */
// A real artifact, not a fragment: parse() over a bare element yields nothing
// walkable, so a fragment-based harness reports zero findings and passes for the
// wrong reason. Cost twenty minutes the first time.
const doc = (body: string): string =>
  `<!doctype html><html lang="en"><head><title>t</title></head><body><main>${body}</main></body></html>`;

function check(docs: ReadonlyArray<{ file: string; html: string }>): Finding[] {
  // parse() returns a whole ParsedDocument, not an AST — passing it as `ast`
  // yields a walk that finds nothing and a suite that passes for the wrong
  // reason. Build the document through parse() and use what it returns.
  const parsed: ParsedDocument[] = docs.map((d) => parse(doc(d.html), d.file));
  return noDuplicateIdsRule.check({ docs: parsed });
}

const live = (id: string) => `<spec-requirement id="${id}" priority="must"><p>Live.</p></spec-requirement>`;
const proposed = (id: string) =>
  `<spec-delta op="modified" target="${id}">${live(id)}</spec-delta>`;

describe('no-duplicate-ids', () => {
  it('flags the same project-wide id defined in two specs', () => {
    const f = check([
      { file: 'specs/001-a/spec.html', html: live('REQ-TOOL-003') },
      { file: 'specs/002-b/spec.html', html: live('REQ-TOOL-003') },
    ]);
    expect(f).toHaveLength(2);
    expect(f[0]?.rule).toBe('no-duplicate-ids');
  });

  it('does NOT flag a live spec against an in-flight proposal modifying it', () => {
    const f = check([
      { file: 'specs/090-x/spec.html', html: live('REQ-TOOL-003') },
      { file: 'specs/090-x/changes/2026-08-12-y/proposal.html', html: proposed('REQ-TOOL-003') },
    ]);
    expect(f).toEqual([]);
  });

  it('still flags two proposals that both define the id outside a delta', () => {
    const f = check([
      { file: 'specs/090-x/changes/a/proposal.html', html: live('REQ-TOOL-003') },
      { file: 'specs/090-x/changes/b/proposal.html', html: live('REQ-TOOL-003') },
    ]);
    expect(f).toHaveLength(2);
  });

  it('leaves spec-local ids alone — only project-wide ids are contracts', () => {
    expect(
      check([
        { file: 'specs/001-a/spec.html', html: live('FR-004') },
        { file: 'specs/002-b/spec.html', html: live('FR-004') },
      ]),
    ).toEqual([]);
  });
});
