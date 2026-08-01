import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Content tests for spec 075-spec-data-model-layering: the spec template's §4
 * data-model guidance, and the matching framing in commands/spectastic.spec.md.
 *
 * The spec's §4 sits at the wrong altitude today — a <dl> of entity→sentence
 * that invites field lists, when the conceptual model (entities, relationships,
 * invariants, state transitions) is what belongs there and the physical model
 * and consumer contract belong in the design (069's §3).
 *
 * Documentation-only by construction (NFR-001): this file asserts authored
 * prose, and there is deliberately no validate rule, element, or generator
 * change to test.
 *
 * Written before the content exists (T-100/T-200/T-201/T-300) — failing until
 * T-110/T-210/T-211/T-310/T-311 land.
 */

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(here, '..', '..', '..', 'templates', 'spec.html');
// commands/spectastic.spec.md is the source of truth (CLAUDE.md: .claude/commands/
// is a gitignored one-time copy that does not auto-sync) — read the source, not
// the copy, so this test can't pass against a stale mirror.
const COMMAND_MD = resolve(here, '..', '..', '..', 'commands', 'spectastic.spec.md');

function template(): string {
  return readFileSync(TEMPLATE, 'utf8');
}

function commandMd(): string {
  return readFileSync(COMMAND_MD, 'utf8');
}

/** The §4 data-model section only — guidance elsewhere must not satisfy these. */
function dataModelSection(): string {
  const html = template();
  const start = html.indexOf('id="data"');
  const end = html.indexOf('id="success"');
  expect(start, 'template must carry a §4 data-model section').toBeGreaterThan(-1);
  expect(end, 'template must carry a §5 success section').toBeGreaterThan(start);
  return html.slice(start, end);
}

describe('T-100/FR-001 · the template frames §4 as the CONCEPTUAL model', () => {
  it('names the section as holding the conceptual model', () => {
    expect(dataModelSection()).toMatch(/conceptual/i);
  });

  it('names all four things a conceptual model carries', () => {
    const section = dataModelSection();
    expect(section, 'entities').toMatch(/entit/i);
    expect(section, 'relationships').toMatch(/relationship/i);
    expect(section, 'invariants').toMatch(/invariant/i);
    expect(section, 'state transitions').toMatch(/state transition/i);
  });

  it('states the model is independent of storage and wire format', () => {
    const section = dataModelSection();
    expect(section, 'storage independence').toMatch(/storage/i);
    expect(section, 'wire-format independence').toMatch(/wire/i);
  });
});

describe('T-200/FR-004 · a genuine invariant MAY carry precision', () => {
  // This clause is the guard against authors reading "no fields" as "no
  // numbers" and stripping real invariants out of the spec. It is pinned by a
  // test precisely so it cannot be trimmed later as redundant prose.
  it('explicitly permits a precision, range or uniqueness rule where the invariant needs one', () => {
    const section = dataModelSection();
    expect(section, 'precision').toMatch(/precision/i);
    expect(section, 'range or uniqueness').toMatch(/range|uniqueness/i);
  });

  it('carries an example, so "no fields" is not misread as "no numbers"', () => {
    // An illustration of a permitted precision rule — a concrete one, not just
    // the abstract permission.
    expect(dataModelSection()).toMatch(/e\.g\.|for example/i);
  });
});

describe('T-300/FR-002 · the template redirects the physical model and the contract', () => {
  it('names where the physical model and consumer contract belong', () => {
    const section = dataModelSection();
    expect(section, 'points at the design').toMatch(/design/i);
    expect(section, 'names the contract').toMatch(/contract/i);
  });

  it('redirects by SECTION NAME, not by number — so it survives renumbering', () => {
    const section = dataModelSection();
    // 069 landed the design's "Data model & contracts" section; referring to it
    // by name means a later renumber cannot silently break the pointer.
    expect(section).toMatch(/data model (&amp;|&|and) contracts/i);
    // And must not pin a bare section number as the referent.
    expect(section, 'must not redirect by bare section number').not.toMatch(/§\s*\d|section\s+\d+\b/i);
  });
});

describe('T-311/FR-006 · the optional sizing note stays a MAY', () => {
  it('says an outgrown data model signals detail belongs downstream, not that the spec should split', () => {
    const section = dataModelSection();
    expect(section).toMatch(/downstream|design/i);
    // Kept as an option, never an instruction — the spec calls it a MAY and it
    // must not harden into a rule in the template's voice.
    expect(section).not.toMatch(/\bMUST split\b|\byou must split\b/i);
  });
});

describe('T-201/FR-003 · the spec command carries the same framing', () => {
  it('asks for concepts and invariants rather than fields', () => {
    const md = commandMd();
    expect(md, 'conceptual').toMatch(/conceptual/i);
    expect(md, 'invariant').toMatch(/invariant/i);
  });

  it('points the physical model and contract at the design', () => {
    const md = commandMd();
    expect(md).toMatch(/data model (&amp;|&|and) contracts/i);
  });

  it('permits precision where an invariant genuinely requires it', () => {
    expect(commandMd()).toMatch(/precision/i);
  });
});
