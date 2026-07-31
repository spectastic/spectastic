import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Content tests for the stack-selection interview instructions added to
 * commands/spectastic.design.md (spec 050-stack-selection, US1/US2).
 *
 * AskUserQuestion is a harness-native interactive tool with no CLI/AI-stub
 * -testable surface — packages/core/src/commands/design.ts's AI contract is a
 * fixed single-shot JSON schema (approach/decisions/alternatives/risks/
 * principles) with no field for stack dimensions. So this asserts
 * structurally against the authored markdown itself, mirroring the
 * commands-drift.test.ts precedent for treating command markdown as data.
 *
 * Written before the content exists (T-100/T-200); failing until
 * T-110/T-111/T-112 (US1) and T-210/T-211 (US2) land.
 */

const here = dirname(fileURLToPath(import.meta.url));
// commands/spectastic.design.md is the source of truth (CLAUDE.md: .claude/commands/
// is a gitignored one-time copy that does not auto-sync) — read the source, not
// the copy, so this test can't pass against a stale mirror.
const PLAN_MD = resolve(here, '..', '..', '..', 'commands', 'spectastic.design.md');

function content(): string {
  return readFileSync(PLAN_MD, 'utf8');
}

describe('stack-selection interview — decision-phase instructions (US1)', () => {
  it('runs a bounded-choice pass over undecided material stack dimensions (FR-001)', () => {
    const md = content();
    expect(md).toMatch(/undecided/i);
    expect(md).toMatch(/AskUserQuestion/);
    expect(md).toMatch(/bounded choice/i);
  });

  it('covers any undecided pick, not a fixed list, and coordinates with the architecture-pattern / enforcement-tool questions (FR-004)', () => {
    const md = content();
    expect(md).toMatch(/not a fixed list/i);
    expect(md).toMatch(/coordinates with, never duplicates/i);
  });

  it('is gated by design.stackInterview, on by default (FR-005)', () => {
    const md = content();
    expect(md).toMatch(/design\.stackInterview/);
    expect(md).toMatch(/default on/i);
  });

  it('seeds recommendations from detection + standing docs + the frameworks axis, never a house catalog (FR-002)', () => {
    const md = content();
    expect(md).toMatch(/CLAUDE\.md/);
    expect(md).toMatch(/AGENTS\.md/);
    expect(md).toMatch(/frameworks.*axis/i);
    expect(md).toMatch(/never a maintained house catalog/i);
  });

  it('presents no crown when no source decisively implies a winner (FR-002)', () => {
    expect(content()).toMatch(/no `\(Recommended\)` crown/i);
  });

  it('writes a confirmed pick into the matching §2 row (FR-007)', () => {
    expect(content()).toMatch(/confirmed pick fills/i);
  });

  it('auto-scaffolds the decision card from a settled pick, options pre-filled (FR-011)', () => {
    const md = content();
    expect(md).toMatch(/auto-scaffold/i);
    expect(md).toMatch(/pre-filled/i);
    expect(md).toMatch(/decision driver/i);
  });
});

describe('stack-selection interview — self-skipping (US2)', () => {
  it('skips any dimension a source already answers, and surfaces (never silently resolves) a conflict (FR-003)', () => {
    const md = content();
    expect(md).toMatch(/skip it if a source above already answers it/i);
    expect(md).toMatch(/never silently resolve/i);
  });

  it('breaks ties using the frameworks axis stance (FR-006, D-004)', () => {
    const md = content();
    expect(md).toMatch(/frameworks.*axis[\s\S]*tie/i);
    expect(md).toMatch(/stdlib\/no-dep/);
    expect(md).toMatch(/mainstream/);
    expect(md).toMatch(/batteries-included/);
  });
});
