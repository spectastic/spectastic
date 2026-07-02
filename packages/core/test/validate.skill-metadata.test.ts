import { describe, expect, it } from 'vitest';
import { skillMetadataFinding, REQUIRED_SKILL_KEYS } from '../src/commands/validate.js';

/**
 * T-602 (spec 000-spectastic, REQ-TOOL-004). The `skill-metadata-shape` rule:
 * a command surfaced as a skill must declare the three structured invocation
 * keys in its source frontmatter. Warning severity so the existing commands
 * can be brought up to the bar without a red build.
 */

const FILE = 'commands/spectastic.spec.md';

const withKeys = (keys: readonly string[]): string =>
  ['---', 'description: do a thing', 'argument-hint: <x>', ...keys.map((k) => `${k}: value`), '---', '', '# body'].join(
    '\n',
  );

describe('skillMetadataFinding', () => {
  it('returns null when all three keys are present', () => {
    expect(skillMetadataFinding(withKeys(REQUIRED_SKILL_KEYS), FILE)).toBeNull();
  });

  it('is order-independent — keys can appear in any order', () => {
    const shuffled = ['sibling-boundary', 'triggers', 'use-when'];
    expect(skillMetadataFinding(withKeys(shuffled), FILE)).toBeNull();
  });

  it('warns and names every missing key when one is absent', () => {
    const finding = skillMetadataFinding(withKeys(['triggers', 'use-when']), FILE);
    expect(finding).not.toBeNull();
    expect(finding?.severity).toBe('warning');
    expect(finding?.rule).toBe('skill-metadata-shape');
    expect(finding?.file).toBe(FILE);
    // The "missing key(s):" segment lists ONLY the absent key — present keys
    // appear only in the trailing required-keys parenthetical, not the missing list.
    expect(finding?.message).toContain('is missing key(s): sibling-boundary —');
    expect(finding?.fixHint).toContain('sibling-boundary');
    expect(finding?.fixHint).not.toContain('triggers');
  });

  it('lists all three when none are present', () => {
    const finding = skillMetadataFinding(withKeys([]), FILE);
    expect(finding?.severity).toBe('warning');
    for (const key of REQUIRED_SKILL_KEYS) {
      expect(finding?.message).toContain(key);
    }
  });

  it('flags a command with no frontmatter at all', () => {
    const finding = skillMetadataFinding('# just a heading, no frontmatter\n', FILE);
    expect(finding?.severity).toBe('warning');
    expect(finding?.message).toContain('no YAML frontmatter');
  });

  it('only matches keys at the start of a line, not substrings of prose', () => {
    // A description mentioning "triggers" in prose must not satisfy the key check.
    const sneaky = ['---', 'description: this command triggers a use-when sibling-boundary vibe', '---'].join('\n');
    const finding = skillMetadataFinding(sneaky, FILE);
    expect(finding?.severity).toBe('warning');
    for (const key of REQUIRED_SKILL_KEYS) {
      expect(finding?.message).toContain(key);
    }
  });

  it('is deterministic — same input, same finding', () => {
    const content = withKeys(['triggers']);
    expect(skillMetadataFinding(content, FILE)).toEqual(skillMetadataFinding(content, FILE));
  });
});
